import request from 'request-promise';
import config from 'config';
import qs from 'querystring';
import ExtendableError from 'es6-error';
import _ from 'lodash';

export class PayPalError extends ExtendableError {
	constructor(payload) {
		super(payload.L_LONGMESSAGE0 || payload.L_SHORTMESSAGE0 || 'PayPalError');
		this.payload = payload;
	}
}

const authData = {
	USER: config.get('paypal.nvp.username'),
	PWD: config.get('paypal.nvp.password'),
	SIGNATURE: config.get('paypal.nvp.signature')
};

const sandbox = config.get('paypal.mode') === 'sandbox';

const paypalRequest = request.defaults({
	uri: sandbox
		? 'https://api-3t.sandbox.paypal.com/nvp'
		: 'https://api-3t.paypal.com/nvp',
	transform(body) {
		return qs.parse(body);
	}
});

function transformResponse(payload) {
	if (payload.ACK === 'Failure') {
		throw new PayPalError(payload);
	} else {
		return payload;
	}
}

function buildPaymentRequests(payments) {
	const paymentRequests = {};
	for (let i = 0; i < payments.length; i++) {
		const payment = payments[i];

		let itemsAmount = 0;
		let taxAmount = 0;
		for (const item of payment.items) {
			itemsAmount += item.amount;
			taxAmount += item.taxAmount || 0;
		}

		itemsAmount = _.round(itemsAmount, 2);
		taxAmount = _.round(taxAmount, 2);

		paymentRequests[`PAYMENTREQUEST_${i}_CURRENCYCODE`] = payment.currency;
		paymentRequests[`PAYMENTREQUEST_${i}_AMT`] = itemsAmount + taxAmount;
		paymentRequests[`PAYMENTREQUEST_${i}_TAXAMT`] = taxAmount;
		paymentRequests[`PAYMENTREQUEST_${i}_ITEMAMT`] = itemsAmount;
		paymentRequests[`PAYMENTREQUEST_${i}_PAYMENTACTION`] = payment.action;
		paymentRequests[`PAYMENTREQUEST_${i}_DESC`] = payment.description;
		paymentRequests[`PAYMENTREQUEST_${i}_SELLERPAYPALACCOUNTID`] = payment.receiver;
		paymentRequests[`PAYMENTREQUEST_${i}_PAYMENTREQUESTID`] = payment.id;

		for (let j = 0; j < payment.items.length; j++) {
			paymentRequests[`L_PAYMENTREQUEST_${i}_ITEMCATEGORY${j}`] = 'Digital';
			paymentRequests[`L_PAYMENTREQUEST_${i}_NAME${j}`] = payment.items[j].name || payment.items[j].id;
			paymentRequests[`L_PAYMENTREQUEST_${i}_NUMBER${j}`] = payment.items[j].id || payment.items[j].name;
			paymentRequests[`L_PAYMENTREQUEST_${i}_QTY${j}`] = payment.items[j].qty || 1;
			paymentRequests[`L_PAYMENTREQUEST_${i}_AMT${j}`] = payment.items[j].amount;
			paymentRequests[`L_PAYMENTREQUEST_${i}_TAXAMT${j}`] = payment.items[j].taxAmount || 0;
			if (payment.items[j].description) {
				paymentRequests[`L_PAYMENTREQUEST_${i}_DESC${j}`] = payment.items[j].description;
			}
			if (payment.items[j].url) {
				paymentRequests[`L_PAYMENTREQUEST_${i}_ITEMURL${j}`] = payment.items[j].url;
			}
		}

		if (payment.ipn) {
			paymentRequests[`PAYMENTREQUEST_${I}_NOTIFYURL`] = payment.ipn;
		}

		if (payment.recurring) {
			paymentRequests[`L_BILLINGTYPE${i}`] = 'RecurringPayments';
			paymentRequests[`L_BILLINGAGREEMENTDESCRIPTION${i}`] = payment.description;
		}
	}
	return paymentRequests;
}

export default {
	async setExpressCheckout(options) {
		const payload = await paypalRequest({
			qs: {
				...authData,
				METHOD: 'SetExpressCheckout',
				VERSION: 204,
				RETURNURL: options.returnURL,
				CANCELURL: options.cancelURL,
				NOSHIPPING: 1,
				SOLUTIONTYPE: 'Sole',
				...buildPaymentRequests(options.payments)
			}
		});

		return transformResponse(payload);
	},

	async setSubscriptionExpressCheckout(options) {
		const rawPayload = await paypalRequest({
			qs: {
				...authData,
				METHOD: 'SetExpressCheckout',
				VERSION: 204,
				RETURNURL: options.returnURL,
				CANCELURL: options.cancelURL,
				NOSHIPPING: 1,
				SOLUTIONTYPE: 'Mark',
				...buildPaymentRequests(options.payments),
				MAXAMT: options.maxAmount
			}
		});

		return transformResponse(rawPayload);
	},

	async createRecurringPaymentsProfile(options, paymentRequests) {
		const rawPayload = await paypalRequest({
			qs: {
				...authData,
				METHOD: 'CreateRecurringPaymentsProfile',
				VERSION: 204,
				TOKEN: options.token,
				PROFILESTARTDATE: options.startDate,
				DESC: options.description,
				AUTOBILLOUTAMT: 'AddToNextBilling',
				BILLINGPERIOD: options.billingPeriod,
				BILLINGFREQUENCY: 1,
				AMT: options.amount,
				INITAMT: options.initAmount,
				FAILEDINITAMTACTION: 'CancelOnFailure',
				CURRENCYCODE: 'USD',
				EMAIL: options.email,
				...paymentRequests
			}
		});

		return transformResponse(rawPayload);
	},

	checkoutURL(token) {
		if (sandbox) {
			return `https://www.sandbox.paypal.com/checkoutnow?token=${token}`;
		} else {
			return `https://www.paypal.com/checkoutnow?token=${token}`;
		}
	},

	async getExpressCheckoutInfo(ecToken) {
		const rawPayload = await paypalRequest({
			qs: {
				...authData,
				METHOD: 'GetExpressCheckoutDetails',
				VERSION: 204,
				TOKEN: ecToken
			}
		});

		const payload = transformResponse(rawPayload);

		payload.paymentRequests = [];

		for (let i = 0; payload[`PAYMENTREQUEST_${i}_PAYMENTREQUESTID`]; i++) {
			payload.paymentRequests.push({
				id: payload[`PAYMENTREQUEST_${i}_PAYMENTREQUESTID`],
				transactionId: payload[`PAYMENTREQUEST_${i}_TRANSACTIONID`]
			});
		}

		return payload;
	},
	async doExpressCheckoutPayment(ecToken, payerId, paymentRequests) {
		const payload = await paypalRequest({
			qs: {
				...authData,
				METHOD: 'DoExpressCheckoutPayment',
				VERSION: 204,
				TOKEN: ecToken,
				PAYERID: payerId,
				...paymentRequests
			}
		});

		return transformResponse(payload);
	}
};
