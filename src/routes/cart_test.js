import supertest from 'supertest';
import {clear as clearDb} from 'dbUtils';
import app from 'app';

import {createAndActivateUser, createBeat} from './testUtils';

const agent = supertest(app);

before(app.resolveWhenReady);
beforeEach(clearDb);

describe('api /cart', function () {
	describe('POST /guest', function () {
		it('should return cartId', async function () {
			const createCart = await agent.post('/api/cart/guest').send();

			createCart.statusCode.should.be.equal(200);
			createCart.body.should.have.property('cartId');
			createCart.body.cartId.should.be.a.String();
		});
	});

	describe('GET /:id', function () {
		let beatId, licenseId, buyerAccessToken;

		beforeEach('create beat', async function () {
			buyerAccessToken = await createAndActivateUser('buyer@gmail.com', 'buyer', '123123');
			const accessToken = await createAndActivateUser('test@gmail.com', 'test', '123123');
			beatId = await createBeat(accessToken);
			licenseId = 4;
		});

		it('should return beats in my cart', async function () {
			await agent.post('/api/cart/my/addBeat')
				.set('Authorization', buyerAccessToken)
				.send({
					beatId: beatId,
					licenseId: licenseId
				});

			const cart = await agent.get('/api/cart/my')
				.set('Authorization', buyerAccessToken);

			cart.statusCode.should.be.equal(200);
			cart.body.should.containDeep({
				cart: {
					cartItems: [
						{
							beat: {
								id: beatId
							}
						}
					]
				}
			});
		});
		it('should return beats in guests cart', async function () {
			await agent.post('/api/cart/1f9ceb00-59f9-4d16-a161-2b4491313405/addBeat')
				.send({
					beatId: beatId,
					licenseId: licenseId
				});

			const cart = await agent.get('/api/cart/1f9ceb00-59f9-4d16-a161-2b4491313405');

			cart.statusCode.should.be.equal(200);

			cart.body.should.containDeep({
				cart: {
					cartItems: [
						{
							beat: {
								id: beatId
							}
						}
					]
				}
			});
		});
	});

	describe('POST /my/import', function () {
		let beatId, buyerAccessToken;

		beforeEach('create beat', async function () {
			buyerAccessToken = await createAndActivateUser('buyer@gmail.com', 'buyer', '123123');
			const accessToken = await createAndActivateUser('test@gmail.com', 'test', '123123');
			beatId = await createBeat(accessToken);

			await agent.post('/api/cart/1f9ceb00-59f9-4d16-a161-2b4491313405/addBeat')
				.send({
					beatId: beatId,
					licenseId: 4
				});
		});

		it('should merge guest cart with user cart', async function () {
			const importCart = await agent.post('/api/cart/my/import')
				.set('Authorization', buyerAccessToken)
				.send({cartId: '1f9ceb00-59f9-4d16-a161-2b4491313405'});

			importCart.statusCode.should.be.equal(200);
			importCart.body.should.containDeep({
				cart: {
					cartItems: [
						{
							beat: {
								id: beatId
							}
						}
					]
				}
			});
		});
	});

	describe('POST /:id/addBeat', function () {
		let beatId;

		beforeEach('create beat', async function () {
			const accessToken = await createAndActivateUser('test@gmail.com', 'test', '123123');
			beatId = await createBeat(accessToken);
		});

		it('should add beat', async function () {
			const addBeat = await agent.post('/api/cart/1f9ceb00-59f9-4d16-a161-2b4491313405/addBeat')
				.send({
					beatId: beatId,
					licenseId: 1
				});

			addBeat.statusCode.should.be.equal(200);
			addBeat.body.should.containDeep({
				cart: {
					cartItems: [
						{
							beat: {
								id: beatId
							}
						}
					]
				}
			});
		});

		it('should not add dublicate beat', async function () {
			await agent.post('/api/cart/1f9ceb00-59f9-4d16-a161-2b4491313405/addBeat')
				.send({
					beatId: beatId,
					licenseId: 1
				});

			const addBeat = await agent.post('/api/cart/1f9ceb00-59f9-4d16-a161-2b4491313405/addBeat')
				.send({
					beatId: beatId,
					licenseId: 1
				});

			addBeat.statusCode.should.be.equal(200);
			addBeat.body.cart.cartItems.length.should.be.equal(1);
		});
	});

	describe('POST /:id/removeBeat', function () {
		let beatId;

		beforeEach('create beat', async function () {
			const accessToken = await createAndActivateUser('test@gmail.com', 'test', '123123');
			beatId = await createBeat(accessToken);

			const addBeat = await agent.post('/api/cart/1f9ceb00-59f9-4d16-a161-2b4491313405/addBeat')
				.send({
					beatId: beatId,
					licenseId: 0
				});
		});

		it('should remove beat from cart', async function () {
			const removeBeat = await agent.post('/api/cart/1f9ceb00-59f9-4d16-a161-2b4491313405/removeBeat')
				.send({
					beatId: beatId
				});

			removeBeat.statusCode.should.be.equal(200);
			removeBeat.body.cart.cartItems.length.should.be.equal(0);
		});
	});

	describe('POST /:id/clear', function () {
		let beatId;

		beforeEach('create beat', async function () {
			const accessToken = await createAndActivateUser('test@gmail.com', 'test', '123123');
			beatId = await createBeat(accessToken);

			const addBeat = await agent.post('/api/cart/1f9ceb00-59f9-4d16-a161-2b4491313405/addBeat')
				.send({
					beatId: beatId,
					licenseId: 0
				});
		});

		it('should empty cart', async function () {
			const removeBeats = await agent.post('/api/cart/1f9ceb00-59f9-4d16-a161-2b4491313405/clear')
				.send();

			removeBeats.statusCode.should.be.equal(200);
			removeBeats.body.cart.cartItems.length.should.be.equal(0);
		});
	});
});
