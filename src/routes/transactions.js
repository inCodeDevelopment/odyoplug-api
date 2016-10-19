import { Router } from 'express';
import { validate, authorizedOnly } from 'middlewares';
import { HttpError } from 'HttpError';
import paypal from 'paypal';
import _ from 'lodash';
import url from 'url';
import config from 'config';

import { Transaction, Beat, CartItem, BeatFile, User } from 'db';

import { wrap } from './utils';

const transactions = Router();

transactions.get('/',
	authorizedOnly,
	wrap(async function(req, res) {
		const query = {};

		if (req.query.q) {
			query.$or = [
				{tx: {$iLike: `%${req.query.q}%`}},
				{transactionId: {$iLike: `%${req.query.q}%`}},
				{paypalBuyer: {$iLike: `%${req.query.q}%`}},
				{paypalSeller: {$iLike: `%${req.query.q}%`}},
				{'items.beat.name': {$iLike: `%${req.query.q}%`}},

				{'subTransactions.tx': {$iLike: `%${req.query.q}%`}},
				{'subTransactions.transactionId': {$iLike: `%${req.query.q}%`}},
				{'subTransactions.paypalBuyer': {$iLike: `%${req.query.q}%`}},
				{'subTransactions.paypalSeller': {$iLike: `%${req.query.q}%`}},
				{'subTransactions.items.beat.name': {$iLike: `%${req.query.q}%`}}
			];
		}

		if (req.query.type) {
			query.type = {$in: req.query.type};
		}

		const transactions = await Transaction
			.scope('with:subTransactions', 'with:items')
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
	wrap(async function(req, res) {
		const transaction = await Transaction
			.scope('with:subTransactions', 'with:items')
			.findOne({
				where: {
					userId: req.user_id,
					paypalECToken: req.query.ecToken
				}
			});

		if (!transaction) {
			throw new HttpError(404, 'not_found');
		}

		res.status(200).json({transaction});
		req.stop = true;
	})
);

const updateTransactionInfoByPayPalECToken = wrap(
	async function(req, res) {
		const transaction = await Transaction
			.scope('with:subTransactions', 'with:items')
			.findOne({
				where: {
					userId: req.user_id,
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
	wrap(async function(req, res) {
		const transaction = await Transaction
			.scope('with:subTransactions', 'with:items')
			.findOne({
				where: {
					userId: req.user_id,
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

transactions.post('/updateTransactionInfoByPayPalECToken',
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
	wrap(async function(req, res) {
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
		const beats = await CartItem
			.findAll({
				where: req.cart,
				include: [{
					model: Beat,
					include: [
						{model: User},
						{model: BeatFile, as: 'file'}
					]
				}]
			})
			.map(_.property('beat'));

		const transaction = await Transaction.create({
			userId: req.user_id,
			tx: sequelize.literal(`'ODY-' || nextval('transactions_tx_seq')`),
			type: 'beats_purchase',
			amount: _.round(_.sumBy(beats, 'price'), 2),
			status: 'wait'
		});

		function tax(price) {
			return _.round(price * 0.1, 2);
		}

		function priceAT(price) {
			return _.round(price - tax(price), 2);
		}

		const taxAmount = _.round(_.sumBy(beats, beat => tax(beat.price)), 2);
		const payments = [
			{
				currency: 'USD',
				action: 'SALE',
				description: 'ODYOPLUG TAX',
				receiver: config.get('paypal.receiver'),
				id: `${transaction.tx}-TAX`,
				items: [{
					id: 'ODYOPLUG-TAX',
					amount: taxAmount
				}]
			}
		];
		await transaction.createSubTransaction({
			userId: req.user_id,
			tx: `${transaction.tx}-TAX`,
			type: 'tax',
			amount: taxAmount,
			status: 'wait'
		});

		const beatsByUser = _.groupBy(beats, 'userId');
		for (const userId of Object.keys(beatsByUser)) {
			payments.push({
				currency: 'USD',
				action: 'SALE',
				description: beatsByUser[userId][0].user.name,
				receiver: beatsByUser[userId][0].user.paypalReceiver,
				id: `${transaction.tx}-${userId}`,
				items: beatsByUser[userId].map(
					beat => ({
						name: beat.name,
						id: `BEAT-${beat.id}`,
						amount: priceAT(beat.price)
					})
				)
			});

			const subTransactions = await transaction.createSubTransaction({
				userId: req.user_id,
				tx: `${transaction.tx}-${userId}`,
				type: 'beats_purchase',
				amount: _.sumBy(beatsByUser[userId], beat => priceAT(beat.price)),
				status: 'wait',
				paypalSeller: beatsByUser[userId][0].user.paypalReceiver
			});

			for (const beat of beatsByUser[userId]) {
				await subTransactions.createItem({
					price: beat.price,
					type: 'beat',
					beatId: beat.id
				});
			}
		}

		const baseURL = req.get('Referer') || config.baseUrl;

		const expressCheckout = await paypal.setExpressCheckout({
			returnURL: url.resolve(baseURL, '/placeholder/ask_me_to_change_it/i_will_do_it_as_soon_as_possible'),
			cancelURL: url.resolve(baseURL, '/placeholder/ask_me_to_change_it/i_will_do_it_as_soon_as_possible'),
			payments: payments
		});

		transaction.set({
			payments: payments.length,
			paypalECToken: expressCheckout.TOKEN
		});

		await transaction.save();

		res.status(200).json({
			url: paypal.checkoutURL(expressCheckout.TOKEN)
		});
	})
);

export default transactions;
