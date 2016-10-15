import config from 'config';
import supertest from 'supertest';
import { clear as clearDb } from 'dbUtils';
import app from 'app';
import should from 'should';

import { createAndActivateUser, createBeat } from './testUtils';

const agent = supertest(app);

before(app.resolveWhenReady);
beforeEach(clearDb);

describe('api /transactions', function () {
	let accessToken, accessTokenBuyer, transactionId;

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
	});

	describe('GET /', function () {
		it.skip('should return list of transactions', async function() {
			const transactionsIndex = await agent.get('/api/transactions')
				.set('Authorization', accessTokenBuyer);

			transactionsIndex.statusCode.should.be.equal(200);
			transactionsIndex.body.should.have.property('transactions');
			transactionsIndex.body.transactions.length.should.be.equal(1);
		});
	});

	describe('GET /:id', function () {
		it.skip('should return single transaction', async function() {
			const getTransaction = await agent.get(`/api/transactions/${transactionId}`)
				.set('Authorization', accessTokenBuyer);

			getTransaction.statusCode.should.be.equal(200);
			getTransaction.body.should.have.property('transaction');
		});
		it.skip('should return 403 on attempt to read others transaction', async function() {
			const getTransaction = await agent.get(`/api/transactions/${transactionId}`)
				.set('Authorization', accessToken);

			getTransaction.statusCode.should.be.equal(404);
			getTransaction.body.should.not.have.property('transaction');
		});
	})
});
