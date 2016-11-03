import {Router} from 'express';
import {validate, authorizedOnly} from 'middlewares';
import {HttpError} from 'HttpError';
import paypal from 'paypal';
import _ from 'lodash';
import config from 'config';

import {Transaction, Beat, CartItem, User} from 'db';

import {wrap} from './utils';

const transactions = Router();

transactions.get('/',
	authorizedOnly,
	wrap(async function (req, res) {
		const query = {};

		const iLike = {$iLike: `%${req.query.q}%`};
		if (req.query.q) {
			query.$or = [
				{tx: iLike},
				{paypalId: iLike},
				{paypalBuyer: iLike},
				{paypalSeller: iLike},
				{itemNames: iLike}
			];
		}

		if (req.query.type) {
			query.type = {$in: req.query.type};
		}

		const transactions = await Transaction
			.scope('with:items,items.beat.user', 'skip:superTransactions')
			.findAll({
				where: {
					...query,
					userId: req.user_id
				}
			});

		res.status(200).json({transactions});
	})
);

transactions.get('/getByPayPalECToken',
	authorizedOnly,
	wrap(async function (req, res) {
		const superTransaction = await Transaction
			.findOne({
				where: {
					paypalECToken: req.query.ecToken
				}
			});

		if (!superTransaction) {
			throw new HttpError(404, 'not_found');
		}

		const transactions = await superTransaction.getSubTransactions({
			scope: 'with:items,items.beat.user',
			where: {
				userId: req.user_id
			}
		});


		res.status(200).json({transactions});
		req.stop = true;
	})
);

const updateTransactionInfoByPayPalECToken = wrap(
	async function (req, res) {
		const transaction = await Transaction
			.scope('with:items')
			.findOne({
				where: {
					paypalECToken: req.body.ecToken
				}
			});

		if (!transaction) {
			throw new HttpError(404, 'not_found');
		}

		if (transaction.status === 'success') {
			res.status(200).json({transaction});
		}

		const ecInfo = await paypal.getExpressCheckoutInfo(req.body.ecToken);

		transaction.status = ({
			PaymentActionNotInitiated: 'wait',
			PaymentActionFailed: 'fail',
			PaymentActionInProgress: 'wait',
			PaymentActionCompleted: 'success'
		})[ecInfo.CHECKOUTSTATUS];

		await Transaction.update({
			status: transaction.status
		}, {
			where: {
				superTransactionId: transaction.id
			}
		});
		await transaction.save();

		// create sellers transactions
		if (transaction.previous('status') !== transaction.status && transaction.status === 'success') {
			const subTransactions = await transaction.getSubTransactions();

			for (const subTransaction of subTransactions) {
				const paypalTransactionId = _.find(
					ecInfo.paymentRequests,
					{id: subTransaction.tx}
				).transactionId;
				await Transaction.create({
					userId: subTransaction.tx.split('-')[2], // @TODO extract to method or virtual
					tx: subTransaction.tx,
					type: 'beats_sell',
					amount: subTransaction.amount,
					status: 'success',
					paypalId: paypalTransactionId,
					paypalBuyer: ecInfo.BUYER
				});

				subTransaction.paypalId = paypalTransactionId;
				await subTransaction.save();
			}
		}

		await transaction.reload();

		res.status(200).json({
			transactions: await Transaction
				.scope('with:items,items.beat.user')
				.findAll({
					where: {
						superTransactionId: transaction.id,
						userId: req.user_id
					}
				})
		});
	}
);

transactions.post('/finalizeByPayPalECToken',
	authorizedOnly,
	validate({
		body: {
			ecToken: {
				errorMessage: 'Invalid ec token',
				notEmpty: true
			}
		}
	}),
	wrap(async function (req, res) {
		const transaction = await Transaction
			.scope('with:items')
			.findOne({
				where: {
					paypalECToken: req.body.ecToken
				}
			});

		if (!transaction) {
			throw new HttpError(404, 'not_found');
		}

		const ecInfo = await paypal.getExpressCheckoutInfo(req.body.ecToken);
		if (!ecInfo.PAYERID) {
			return;
		}
		const payments = {};
		for (const key of Object.keys(ecInfo)) {
			if (key.startsWith('PAYMENTREQUEST_') || key.startsWith('L_PAYMENTREQUEST_')) {
				payments[key] = ecInfo[key];
			}
		}

		try {
			await paypal.doExpressCheckoutPayment(req.body.ecToken, ecInfo.PAYERID, payments);
		} catch (error) {
			if (error.payload && error.payload.L_ERRORCODE0 === 10486) {
				throw new HttpError(422, 'refused', {
					url: paypal.checkoutURL(req.body.ecToken)
				});
			} else {
				throw error;
			}
		}
	}),
	updateTransactionInfoByPayPalECToken
);

transactions.post('/refreshByPayPalECToken',
	authorizedOnly,
	validate({
		body: {
			ecToken: {
				errorMessage: 'Invalid ec token',
				notEmpty: true
			}
		}
	}),
	updateTransactionInfoByPayPalECToken
);

transactions.get('/:id(\\d+)',
	authorizedOnly,
	wrap(async function (req, res) {
		const transaction = await Transaction.scope('with:items,items.beat.user').findOne({
			where: {
				userId: req.user_id,
				id: req.params.id
			}
		});

		if (!transaction) {
			throw new HttpError(404, 'not_found');
		}

		res.status(200).json({transaction});
	})
);

transactions.post('/cart',
	wrap(async function (req, res) {
		const cartItems = await CartItem.findAll({
			where: {
				userId: req.user_id
			},
			include: [{
				model: Beat,
				include: [
					{model: User}
				]
			}]
		});

		const transaction = await Transaction.create({
			type: 'beats_purchase',
			amount: _.round(_.sumBy(cartItems, cartItem =>
				cartItem.beat.price(cartItem.licenseId)
			), 2),
			status: 'wait'
		});

		const tax = _.round(_.sumBy(cartItems, cartItem =>
			cartItem.beat.tax(cartItem.licenseId)
		), 2);
		const payments = [
			{
				currency: 'USD',
				action: 'SALE',
				description: 'ODYOPLUG TAX',
				receiver: config.get('paypal.receiver'),
				id: `${transaction.tx}-TAX`,
				items: [{
					id: 'ODYOPLUG-TAX',
					amount: tax
				}]
			}
		];

		const cartItemsByUser = _.groupBy(cartItems, 'beat.userId');
		for (const userId of Object.keys(cartItemsByUser)) {
			const user = cartItemsByUser[userId][0].beat.user;
			const userCartItems = cartItemsByUser[userId];

			const subTransaction = await transaction.createSubTransaction({
				userId: req.user_id,
				tx: `${transaction.tx}-${userId}`,
				type: 'beats_purchase',
				amount: _.round(_.sumBy(userCartItems, cartItem =>
					cartItem.beat.price(cartItem.licenseId)
				), 2),
				status: 'wait',
				paypalSeller: user.paypalReceiver || user.email,
				itemNames: _.map(userCartItems, 'beat.name').join(',')
			});

			for (const cartItem of userCartItems) {
				await subTransaction.createItem({
					price: cartItem.beat.price(cartItem.licenseId),
					type: 'beat',
					beatId: cartItem.beat.id
				});
			}

			payments.push({
				currency: 'USD',
				action: 'SALE',
				description: user.name,
				receiver: user.paypalReceiver || user.email,
				id: subTransaction.tx,
				items: userCartItems.map(
					cartItem => ({
						name: cartItem.beat.name,
						id: `BEAT-${cartItem.beat.id}`,
						amount: cartItem.beat.priceAfterTax(cartItem.licenseId)
					})
				)
			});
		}

		const expressCheckout = await paypal.setExpressCheckout({
			returnURL: req.resolveFromBaseURL('/checkout/ok'),
			cancelURL: req.resolveFromBaseURL('/checkout/abort'),
			payments: payments
		});

		transaction.paypalECToken = expressCheckout.TOKEN;
		await transaction.save();

		res.status(200).json({
			url: paypal.checkoutURL(expressCheckout.TOKEN)
		});
	})
);

export default transactions;
