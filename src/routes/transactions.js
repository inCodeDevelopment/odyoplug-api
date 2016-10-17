import { Router } from 'express';
import { validate, authorizedOnly } from 'middlewares';
import { HttpError } from 'HttpError';
import config from 'config';
import paypal from 'paypal';
import _ from 'lodash';

import { Transaction, Beat, BeatFile } from 'db';

import { wrap } from './utils';

const transactions = Router();

transactions.get('/',
	authorizedOnly,
	wrap(async function(req, res) {
		const transactions = await Transaction
			.scope('with:subTransactions', 'with:items')
			.findAll({
				where: {
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

		await transaction.reload();

		res.status(200).json({transaction})
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

		await paypal.doExpressCheckoutPayment(req.body.ecToken, ecInfo.PAYERID, payments);
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
