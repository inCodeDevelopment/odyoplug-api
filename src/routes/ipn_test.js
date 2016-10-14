import config from 'config';
import supertest from 'supertest';
import { clear as clearDb } from 'dbUtils';
import app from 'app';
import should from 'should';
import sinon from 'sinon';
import ipn from 'paypal-ipn';

import { createAndActivateUser, createBeat } from './testUtils';


const agent = supertest(app);

before(app.resolveWhenReady);
beforeEach(clearDb);

describe('api /ipn', function () {
	before(function () {
		sinon.stub(ipn, 'verify', function(params, options, next) {
			next(null)
		});
	});
	after(function () {
		ipn.verify.restore();
	});

	describe('POST /beatsPurchase', function () {
		let accessToken, accessTokenBuyer, transactionId, custom;
		beforeEach(async function() {
			accessToken = await createAndActivateUser('test@gmail.com', 'test', '123123');
			accessTokenBuyer = await createAndActivateUser('test-buyer@gmail.com', 'buyer', '123123');

			const beatId = await createBeat(accessToken);

			const addBeat = await agent.post('/api/cart/my/addBeat')
				.set('Authorization', accessTokenBuyer)
				.send({
					beatId: beatId
				});

			const createTransaction = await agent.post('/api/cart/my/transaction')
				.set('Authorization', accessTokenBuyer)
				.send();

			transactionId = createTransaction.body.transactionId;
			custom = createTransaction.body.data.custom;
		})

		it('should change transaction status to success', async function () {
			await agent.post('/api/ipn/beatsPurchase')
				.send({
					custom: custom,
					payment_status: 'Completed',
					mc_gross: '3.99',
					mc_currency: 'USD'
				});

			const getTransaction = await agent.get(`/api/transactions/${transactionId}`)
				.set('Authorization', accessTokenBuyer);

			getTransaction.body.transaction.status.should.be.equal('success');
		});
		it('should clear shopping cart', async function () {
			await agent.post('/api/ipn/beatsPurchase')
				.send({
					custom: custom,
					payment_status: 'Completed',
					mc_gross: '3.99',
					mc_currency: 'USD'
				});

			const getCart = await agent.get('/api/cart/my')
				.set('Authorization', accessTokenBuyer);

			getCart.body.cart.beats.length.should.be.equal(0);
		});
		it('should return error if transactionId is not provided', async function () {
			const ipnResponse = await agent.post('/api/ipn/beatsPurchase')
				.send({
					custom: JSON.stringify({user: JSON.parse(custom).user}),
					payment_status: 'Completed',
					mc_gross: '3.99',
					mc_currency: 'USD'
				});

			ipnResponse.statusCode.should.be.equal(500);
		});
		it('should return error if transaction amount does not match ipn amount', async function () {
			const ipnResponse = await agent.post('/api/ipn/beatsPurchase')
				.send({
					custom: custom,
					payment_status: 'Completed',
					mc_gross: '2.99',
					mc_currency: 'USD'
				});

			ipnResponse.statusCode.should.be.equal(500);
		});
		it('should return error if transaction not found', async function () {
			const ipnResponse = await agent.post('/api/ipn/beatsPurchase')
				.send({
					custom: JSON.stringify({user: JSON.parse(custom).user, transactionId: 'foobar'}),
					payment_status: 'Completed',
					mc_gross: '3.99',
					mc_currency: 'USD'
				});

			ipnResponse.statusCode.should.be.equal(500);
		});
		it('should set transaction status to fail if payment_status is Failed or Denied', async function () {
			await agent.post('/api/ipn/beatsPurchase')
				.send({
					custom: custom,
					payment_status: 'Failed',
					mc_gross: '3.99',
					mc_currency: 'USD'
				});

			const getTransaction = await agent.get(`/api/transactions/${transactionId}`)
				.set('Authorization', accessTokenBuyer);

			getTransaction.body.transaction.status.should.be.equal('fail');
		});
		it('should create transaction for seller', async function () {
			await agent.post('/api/ipn/beatsPurchase')
				.send({
					custom: custom,
					payment_status: 'Completed',
					mc_gross: '3.99',
					mc_currency: 'USD'
				});

			const getTransactions = await agent.get(`/api/transactions`)
				.set('Authorization', accessToken);

			getTransactions.body.transactions.length.should.be.equal(1);
		});
	});
});
