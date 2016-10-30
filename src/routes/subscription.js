import {Router} from 'express';
import config from 'config';
import paypal from 'paypal';

import {authorizedOnly, validate} from 'middlewares';

import {Transaction} from 'models';
import _ from 'lodash';

import {wrap} from './utils';
import {HttpError} from 'HttpError';

const subscription = Router();

subscription.use(authorizedOnly);

subscription.get('/',
	wrap(async function (req, res) {

	})
);

subscription.post('/initialize',
	validate({
		body: {
			period: {
				notEmpty: true,
				errorMessage: 'Invalid subscription period'
			},
			rate: {
				notEmpty: true,
				errorMessage: 'Invalid subscription rate'
			}
		}
	}),
	wrap(async function (req, res) {
		if (!config.rates[req.body.rate]) {
			throw new HttpError.invalidInput('rate', 'Invalid subscription rate', req.body.rate);
		}

		const rate = config.rates[req.body.rate];

		if (!['month', 'year'].includes(req.body.period)) {
			throw new HttpError.invalidInput('period', 'Invalid subscription period', req.body.period);
		}

		const subscriptionTransaction = await Transaction.create({
			type: 'beats_purchase',
			amount: rate.prices[req.body.period],
			status: 'wait',
			details: {
				rate: req.body.rate,
				period: req.body.period
			}
		});

		const subscriptionExpressCheckout = await paypal.setSubscriptionExpressCheckout({
			returnURL: req.resolveFromBaseURL('/subscription/ok'),
			cancelURL: req.resolveFromBaseURL('/subscription/abort'),
			payments: [
				{
					currency: 'USD',
					action: 'SALE',
					recurring: true,
					description: rate.title,
					receiver: config.paypal.receiver,
					id: subscriptionTransaction.tx,
					items: [{
						name: rate.title,
						id: rate.id,
						amount: rate.prices[req.body.period]
					}],
					maxAmount: config.rates.maxAmount
				}
			]
		});

		subscriptionTransaction.set('paypalECToken', subscriptionExpressCheckout.TOKEN);
		await subscriptionTransaction.save();

		res.status(200).json({
			url: paypal.checkoutURL(subscriptionExpressCheckout.TOKEN)
		});
	})
);

subscription.post('/finalize',
	validate({
		body: {
			ecToken: {
				notEmpty: true,
				errorMessage: 'Invalid subscription ecToken'
			}
		}
	}),
	wrap(async function (req, res) {
		const transaction = await Transaction
			.findOne({
				where: {
					paypalECToken: req.body.ecToken
				}
			});

		if (!transaction) {
			throw new HttpError(404, 'not_found');
		}

		const rate = config.rates[transaction.details.rate];

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

		const reccuringPaymentProfile = await paypal.createRecurringPaymentsProfile({
			token: req.body.ecToken,
			startDate: (new Date()).toISOString(),
			billingPeriod: _.capitalize(transaction.details.period),
			amount: rate.prices[transaction.details.period],
			email: ecInfo.EMAIL,
			description: rate.title
		}, payments);

		res.status(200).json(reccuringPaymentProfile);
	})
);

export default subscription;
