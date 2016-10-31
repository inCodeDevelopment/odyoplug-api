import {Router} from 'express';
import config from 'config';
import paypal from 'paypal';

import {authorizedOnly, validate} from 'middlewares';

import {Transaction, User} from 'models';
import _ from 'lodash';
import date from 'date.js';
import ipn from 'paypal-ipn';

import {wrap} from './utils';
import {HttpError} from 'HttpError';

const subscription = Router();

subscription.get('/',
	authorizedOnly,
	wrap(async function (req, res) {
		res.status(200).json({
			subscription: req.user.subscription || {rate: 'free'}
		})
	})
);

subscription.post('/initialize',
	authorizedOnly,
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
					maxAmount: config.rates.maxAmount,
					ipn: `${config.baseURL}api/subscription/ipn`
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
	authorizedOnly,
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

		const recurringPaymentProfile = await paypal.createRecurringPaymentsProfile({
			token: req.body.ecToken,
			startDate: date(`in 1 ${transaction.details.period}`).toISOString(),
			billingPeriod: _.capitalize(transaction.details.period),
			amount: rate.prices[transaction.details.period],
			initAmount: rate.prices[transaction.details.period],
			email: ecInfo.EMAIL,
			description: rate.title
		}, payments);

		req.user.set('subscription', {
			method: 'paypal',
			profileId: recurringPaymentProfile.PROFILEID,
			rate: transaction.details.rate,
			payedUntil: date(`in 1 ${transaction.details.period}`).getTime(),
			autoRenew: true
		});
		req.user.set('subscriptionId', recurringPaymentProfile.PROFILEID);

		await req.user.save();

		res.status(200).json({});
	})
);

subscription.post('/ipn',
	function (req, res, next) {
		ipn.verify(req.body, {
			allow_sandbox: config.paypal.mode === 'sandbox'
		}, next);
	},
	wrap(async function (req, res) {
		const profileId = req.body.recurring_payment_id;

		if (!profileId) {
			res.status(200).send('');
		}

		const user = await User.findOne({
			where: {
				subscriptionId: profileId
			}
		});

		if (!user) {
			res.status(200).send('');
		}

		switch (req.body.txn_type) {
			case 'recurring_payment':
				const payedUntil = new Date(req.body.next_payment_date);
				user.set('subscription', {
					...user.subscription,
					payedUntil: payedUntil.getTime()
				});
				await user.save();
				break;
			case 'recurring_payment_profile_cancel':
			case 'recurring_payment_suspended':
			case 'recurring_payment_suspended_due_to_max_failed_payment':
				user.set('subscription', null);
				await user.save();
				break;
		}

		res.status(200).send('');
	})
);

export default subscription;
