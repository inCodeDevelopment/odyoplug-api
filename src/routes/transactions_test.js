import supertest from 'supertest';
import {clear as clearDb} from 'dbUtils';
import app from 'app';
import {createAndActivateUser, createBeat} from 'routes/testUtils';
import sinon from 'sinon';
import paypal from 'paypal';

const agent = supertest(app);

before(app.resolveWhenReady);
beforeEach(clearDb);

describe('api /transactions', function () {
	let accessTokenBuyer, accessToken1, accessToken2;

	beforeEach(async function () {
		accessToken1 = await createAndActivateUser('ec-merchant0@gmail.com', 'ec_merchant0', '123123');
		accessToken2 = await createAndActivateUser('ec-merchant1@gmail.com', 'ec_merchant1', '123123');
		accessTokenBuyer = await createAndActivateUser('ec-buyer@gmail.com', 'ec_buyer', '123123');

		const beatId = await createBeat(accessToken1, 'Foo');
		const beatId2 = await createBeat(accessToken2, 'Bar');
		const beatId3 = await createBeat(accessToken2, 'FooBar');

		await agent.post('/api/cart/my/addBeat')
			.set('Authorization', accessTokenBuyer)
			.send({
				beatId: beatId,
				licenseId: 1
			});

		await agent.post('/api/cart/my/addBeat')
			.set('Authorization', accessTokenBuyer)
			.send({
				beatId: beatId2,
				licenseId: 4
			});

		await agent.post('/api/cart/my/addBeat')
			.set('Authorization', accessTokenBuyer)
			.send({
				beatId: beatId3,
				licenseId: 4
			});
	});

	beforeEach(function () {
		sinon.stub(paypal, 'setExpressCheckout').returns(Promise.resolve({
			TOKEN: "fubar"
		}))
	});

	afterEach(function () {
		paypal.setExpressCheckout.restore();
	});

	describe('POST /cart', function () {
		it('should create transaction for each producer', async function () {
			const createTransaction = await agent.post('/api/transactions/cart')
				.set('Authorization', accessTokenBuyer)
				.send();

			createTransaction.statusCode.should.be.equal(200);
			createTransaction.body.should.have.property('url');

			const transactions = await agent.get('/api/transactions')
				.set('Authorization', accessTokenBuyer);

			transactions.body.transactions.length.should.be.equal(2);
		});
	});

	describe('GET /', function () {
		beforeEach(async function () {
			await agent.post('/api/transactions/cart')
				.set('Authorization', accessTokenBuyer)
				.send();
		});

		it('should return list of transaction', async function () {
			const transactions = await agent.get('/api/transactions')
				.set('Authorization', accessTokenBuyer);

			transactions.body.transactions.length.should.be.equal(2);
		});
		it('should filter transactions by type', async function () {
			const beatsPurchaseTransactions = await agent.get('/api/transactions?type[]=beats_purchase')
				.set('Authorization', accessTokenBuyer);

			const beatsSellTransactions = await agent.get('/api/transactions?type[]=beats_sell')
				.set('Authorization', accessTokenBuyer);

			beatsPurchaseTransactions.body.transactions.length.should.be.equal(2);
			beatsSellTransactions.body.transactions.length.should.be.equal(0);
		});
		it('should filter transactions by query', async function () {
			const beatsFooTransactions = await agent.get('/api/transactions?q=foo')
				.set('Authorization', accessTokenBuyer);

			const beatsFoobarTransactions = await agent.get('/api/transactions?q=Foobar')
				.set('Authorization', accessTokenBuyer);

			beatsFooTransactions.body.transactions.length.should.be.equal(2);
			beatsFoobarTransactions.body.transactions.length.should.be.equal(1);
		});
	});

	describe('GET /:id', function () {
		beforeEach(async function () {
			await agent.post('/api/transactions/cart')
				.set('Authorization', accessTokenBuyer)
				.send();
		});

		it('should return transaction info', async function () {
			const transactions = await agent.get('/api/transactions')
				.set('Authorization', accessTokenBuyer);

			const transaction = await agent.get(`/api/transactions/${transactions.body.transactions[0].id}`)
				.set('Authorization', accessTokenBuyer);

			transaction.statusCode.should.be.equal(200);
			transaction.body.should.have.property('transaction');
			transaction.body.transaction.should.have.property('items');
		});
	});

	describe('GET /getByPayPalECToken', function () {
		let ecToken;

		beforeEach(async function () {
			const {body: {url}} = await agent.post('/api/transactions/cart')
				.set('Authorization', accessTokenBuyer)
				.send();

			ecToken = url.split('token=')[1];
		});

		it('should return transaction info', async function () {
			const transactionInfo = await agent.get(`/api/transactions/getByPayPalECToken?ecToken=${ecToken}`)
				.set('Authorization', accessTokenBuyer);

			transactionInfo.statusCode.should.be.equal(200);
			transactionInfo.body.transactions.length.should.be.equal(2);
		});
	});

	describe('POST /finalizeByPayPalECToken', function () {
		it('should doExpressCheckout and update transaction status');
		it('should remove bought items from cart');
	});

	describe('POST /refreshByPayPalECToken', function () {
		it('should update transaction status if needed');
		it('should remove bought items from cart');
	});
});
