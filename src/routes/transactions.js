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
		const transactions = await Transaction.scope('with:items').findAll({
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
		const transaction = await Transaction.scope('with:items').findOne({
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
		const transaction = await Transaction.scope('with:items').findOne({
			where: {
				userId: req.user_id,
				paypalECToken: req.body.ecToken
			}
		});

		if (!transaction) {
			throw new HttpError(404, 'not_found');
		}

		const ecInfo = await paypal.getExpressCheckoutInfo(req.body.ecToken);

		const payments = {};
		for (const key of Object.keys(ecInfo)) {
			if (key.startsWith('PAYMENTREQUEST_') || key.startsWith('L_PAYMENTREQUEST_')) {
				payments[key] = ecInfo[key];
			}
		}

		const doCheckout = await paypal.doExpressCheckoutPayment(req.body.ecToken, ecInfo.PAYERID, payments);

		transaction.status = 'success';
		await transaction.save();

		res.status(200).json({transaction});
	})
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
