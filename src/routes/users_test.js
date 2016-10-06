import config from 'config';
import supertest from 'supertest';
import { clear as clearDb } from 'dbUtils';
import app from 'app';
import should from 'should';

before(app.resolveWhenReady);
beforeEach(clearDb);

describe('api /users', function () {
	describe('POST /signup', function () {
		it('should create user and return it', async function () {
			const agent = supertest(app);

			const createUserResponse = await agent.post('/api/users/signup')
				.send({
					email: 'test@gmail.com',
					password: '12345678',
					username: 'test'
				});

			createUserResponse.statusCode.should.be.equal(201);
			createUserResponse.body.should.have.property('access_token');
			createUserResponse.body.user.should.have.property('id');
			createUserResponse.body.user.should.containEql({
				email: 'test@gmail.com'
			});
		});

		it('should return error on username conflict', async function () {
			const agent = supertest(app);

			await agent.post('/api/users/signup')
				.send({
					email: 'test@gmail.com',
					password: '12345678',
					username: 'test'
				});

			const createCollisionUserResponse = await agent.post('/api/users/signup')
				.send({
					email: 'tst@gmail.com',
					password: 'gw45g4v5v05',
					username: 'Test'
				});

			createCollisionUserResponse.statusCode.should.be.equal(400);
			createCollisionUserResponse.body.should.be.eql({
				error: 'invalid_input',
				errors: {
					username: {
						msg: 'Username is taken',
						param: 'username',
						value: 'Test'
					}
				}
			});
		});

		it('should return error on email conflict', async function () {
			const agent = supertest(app);

			await agent.post('/api/users/signup')
				.send({
					email: 'test@gmail.com',
					password: '12345678',
					username: 'test'
				});

			const createCollisionUserResponse = await agent.post('/api/users/signup')
				.send({
					email: 'Test@gmail.com',
					password: 'gw45g4v5v05',
					username: 'test'
				});

			createCollisionUserResponse.statusCode.should.be.equal(400);
			createCollisionUserResponse.body.should.be.eql({
				error: 'invalid_input',
				errors: {
					email: {
						msg: 'Email is already in use',
						param: 'email',
						value: 'Test@gmail.com'
					}
				}
			});
		});
	});

	describe('POST /signin', function () {
		beforeEach('create user', async function () {
			const agent = supertest(app);

			await agent.post('/api/users/signup')
				.send({
					email: 'test@gmail.com',
					password: '123123123',
					username: 'test'
				});
		});

		it('should return Access-Token', async function () {
			const agent = supertest(app);

			const signInResponse = await agent.post('/api/users/signin')
				.send({
					login: 'test@gmail.com',
					password: '123123123'
				});

			signInResponse.statusCode.should.be.equal(200);
			signInResponse.body.should.have.property('access_token');
			signInResponse.body.user.should.have.property('id');
			signInResponse.body.user.should.containEql({
				email: 'test@gmail.com'
			});
		});

		it('should let signin with email in other case', async function () {
			const agent = supertest(app);

			const signInResponse = await agent.post('/api/users/signin')
				.send({
					login: 'TeST@gmail.COM',
					password: '123123123'
				});

			signInResponse.statusCode.should.be.equal(200);
			signInResponse.body.should.have.property('access_token');
			signInResponse.body.user.should.have.property('id');
			signInResponse.body.user.should.containEql({
				email: 'test@gmail.com'
			});
		});

		it('should return error when password is wrong', async function () {
			const agent = supertest(app);

			const signInResponse = await agent.post('/api/users/signin')
				.send({
					login: 'test@gmail.com',
					password: '000000'
				});

			signInResponse.statusCode.should.be.equal(404);
			signInResponse.body.should.be.eql({
				error: 'user_not_found',
				message: "User with such email/username and password not found"
			});
		});

		it('should return error when user not found', async function () {
			const agent = supertest(app);

			const signInResponse = await agent.post('/api/users/signin')
				.send({
					login: 'fubar@test.com',
					password: '000000'
				});

			signInResponse.statusCode.should.be.equal(404);
			signInResponse.body.should.be.eql({
				error: 'user_not_found',
				message: "User with such email/username and password not found"
			});
		});
	});

	describe('GET /me', function () {
		beforeEach('create user', async function() {
			const agent = supertest(app);

			await agent.post('/api/users/signup')
				.send({
					email: 'test@gmail.com',
					password: '123123123',
					username: 'test'
				});
		});

		it('should return user', async function () {
			const agent = supertest(app);

			const signInResponse = await agent.post('/api/users/signin')
				.send({
					login: 'test@gmail.com',
					password: '123123123'
				});

			const getMeResponse = await agent.get('/api/users/me')
				.set('Authorization', signInResponse.body.access_token);

			getMeResponse.statusCode.should.be.equal(200);
			getMeResponse.body.user.should.have.property('id');
			getMeResponse.body.user.should.containEql({
				email: 'test@gmail.com'
			});
		});
	});

	describe('POST /me', function () {
		let agent, access_token;

		beforeEach(async function() {
			agent = supertest(app);

			const signUpReponse = await agent.post('/api/users/signup')
				.send({
					email: 'test@gmail.com',
					password: '123123123',
					username: 'test'
				});

			access_token = signUpReponse.body.access_token;
		});

		it('should update name', async function() {
			const updateMeResponse = await agent.post('/api/users/me')
				.set('Authorization', access_token)
				.send({
					username: 'FooBar'
				});

			updateMeResponse.statusCode.should.be.equal(200);
			updateMeResponse.body.user.should.containEql({
				username: 'FooBar'
			});
		});

		it('should not update email', async function() {
			const updateMeResponse = await agent.post('/api/users/me')
				.set('Authorization', access_token)
				.send({
					email: 'test2@gmail.com'
				});

			updateMeResponse.body.user.should.containEql({
				email: 'test@gmail.com'
			});
		});

		it('should update password', async function() {
			const updateMeResponse = await agent.post('/api/users/me')
				.set('Authorization', access_token)
				.set('Password', '123123123')
				.send({
					password: '1366666631'
				});

			updateMeResponse.statusCode.should.be.equal(200);

			const signInResponse = await agent.post('/api/users/signin')
				.send({
					login: 'test@gmail.com',
					password: '1366666631'
				});

			signInResponse.statusCode.should.be.equal(200);
		});

		it('should not update password if old password is wrong', async function() {
			const updateMeResponse = await agent.post('/api/users/me')
				.set('Authorization', access_token)
				.set('Password', '123123')
				.send({
					password: '1366666631'
				});

			updateMeResponse.statusCode.should.be.equal(403);

			const signInResponse = await agent.post('/api/users/signin')
				.send({
					login: 'test@gmail.com',
					password: '123123'
				});

			signInResponse.statusCode.should.be.equal(404);
		});
	});
});
