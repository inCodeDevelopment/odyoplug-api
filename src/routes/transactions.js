import { Router } from 'express';
import { validate, authorizedOnly } from 'middlewares';
import { HttpError } from 'HttpError';
import paypal from 'paypal';
import _ from 'lodash';

import { Transaction } from 'db';

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
				{'items.beat.name': {$iLike: `%${req.query.q}%`}},

				{'subTransactions.tx': {$iLike: `%${req.query.q}%`}},
				{'subTransactions.transactionId': {$iLike: `%${req.query.q}%`}},
				{'subTransactions.paypalBuyer': {$iLike: `%${req.query.q}%`}},
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
				await Transaction.create({
					userId: subTransaction.tx.split('-')[2], // @TODO extract to method or virtual
					tx: subTransaction.tx,
					type: 'beats_sell',
					amount: subTransaction.amount,
					status: 'success',
					paypalId: _.find(
						ecInfo.paymentRequests,
						{id: subTransaction.tx}
					).transactionId,
					paypalBuyer: ecInfo.BUYER
				});
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

transactions.get('/:id',
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

export default transactions;
