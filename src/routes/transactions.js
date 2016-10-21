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
			.scope('with:items', 'skip:superTransactions')
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
			scope: 'with:items',
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

		res.status(200).json({transaction});
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
		const transaction = await Transaction.scope('with:items').findOne({
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
		const beats = await CartItem.findAll({
			where: {
				userId: req.user_id
			},
			include: [{
				model: Beat,
				include: [
					{model: User}
				]
			}]
		}).map(_.property('beat'));

		const transaction = await Transaction.create({
			type: 'beats_purchase',
			amount: _.round(_.sumBy(beats, 'price'), 2),
			status: 'wait'
		});

		const tax = _.round(_.sumBy(beats, 'tax'), 2);
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

		const beatsByUser = _.groupBy(beats, 'userId');
		for (const userId of Object.keys(beatsByUser)) {
			const user = beatsByUser[userId][0].user;
			const userBeats = beatsByUser[userId];

			const subTransaction = await transaction.createSubTransaction({
				userId: req.user_id,
				tx: `${transaction.tx}-${userId}`,
				type: 'beats_purchase',
				amount: _.round(_.sumBy(userBeats, 'price'), 2),
				status: 'wait',
				paypalSeller: user.paypalReceiver || user.email,
				itemNames: _.map(userBeats, 'name').join(',')
			});

			for (const beat of beatsByUser[userId]) {
				await subTransaction.createItem({
					price: beat.price,
					type: 'beat',
					beatId: beat.id
				});
			}

			payments.push({
				currency: 'USD',
				action: 'SALE',
				description: user.name,
				receiver: user.paypalReceiver || user.email,
				id: subTransaction.tx,
				items: userBeats.map(
					beat => ({
						name: beat.name,
						id: `BEAT-${beat.id}`,
						amount: beat.priceAfterTax
					})
				)
			});
		}

		const expressCheckout = await paypal.setExpressCheckout({
			returnURL: req.resolveFromBaseURL('/placeholder/ask_me_to_change_it/i_will_do_it_as_soon_as_possible'),
			cancelURL: req.resolveFromBaseURL('/placeholder/ask_me_to_change_it/i_will_do_it_as_soon_as_possible'),
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
