import supertest from 'supertest';
import {clear as clearDb} from 'dbUtils';
import app from 'app';
import sinon from 'sinon';
import mailer from 'mailer';
import {createAndActivateUser, createUser} from './testUtils';

const agent = supertest(app);

before(app.resolveWhenReady);
beforeEach(clearDb);

describe('api /users', function () {
	describe('POST /signup', function () {
		it('should create user and return it', async function () {
			const createUserResponse = await agent.post('/api/users/signup')
				.send({
					email: 'test@gmail.com',
					password: '12345678',
					username: 'test'
				});

			createUserResponse.statusCode.should.be.equal(201);
			createUserResponse.body.user.should.have.property('id');
			createUserResponse.body.user.should.containEql({
				email: 'test@gmail.com'
			});
		});

		it('should send activation email', async function () {
			sinon.stub(mailer, 'send').returns(Promise.resolve());

			const createUserResponse = await agent.post('/api/users/signup')
				.send({
					email: 'test@gmail.com',
					password: '12345678',
					username: 'test'
				});

			mailer.send.should.be.calledWithMatch('user-activation', 'test@gmail.com');

			mailer.send.restore();
		});

		it('should return error on username conflict', async function () {
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
						value: 'Test'
					}
				}
			});
		});

		it('should return error on email conflict', async function () {
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
						value: 'Test@gmail.com'
					}
				}
			});
		});
	});

	describe('POST /activate', function () {
		let email = 'test@test.com';
		let activationToken;

		beforeEach('create user', async function () {
			sinon.stub(mailer, 'send').returns(Promise.resolve());

			await agent.post('/api/users/signup')
				.send({
					email: email,
					password: '123123123',
					username: 'test'
				});

			activationToken = mailer.send.firstCall.args[2].activationToken;

			mailer.send.restore();
		});

		it('should activate account', async function () {
			const activateResponse = await agent.post('/api/users/activate')
				.send({email, activationToken});

			activateResponse.statusCode.should.be.equal(200);
			activateResponse.body.should.have.property('access_token');
		});
		it('should reject invalid token', async function () {
			const activateResponse = await agent.post('/api/users/activate')
				.send({email, activationToken: '123'});
			activateResponse.statusCode.should.be.equal(400);
		});
	});

	describe('POST /requestActivationEmail', function () {
		beforeEach('create user', async function () {
			await createUser('test@gmail.com', 'test', '123123');
		});
		it('should send email', async function () {
			sinon.stub(mailer, 'send').returns(Promise.resolve());

			const requestActivationEmailResponse = await agent.post('/api/users/requestActivationEmail')
				.send({
					login: 'test'
				});

			requestActivationEmailResponse.statusCode.should.be.equal(200);

			mailer.send.should.be.calledWithMatch('user-activation', 'test@gmail.com');

			mailer.send.restore();
		});
		it('should return 400 if user not exists', async function () {
			sinon.stub(mailer, 'send').returns(Promise.resolve());

			const requestActivationEmailResponse = await agent.post('/api/users/requestActivationEmail')
				.send({
					login: 'teasdasdasfsafsst'
				});

			requestActivationEmailResponse.statusCode.should.be.equal(400);

			mailer.send.should.not.be.calledWithMatch('user-activation');

			mailer.send.restore();
		});
	});

	describe('POST /requestPasswordRestoreEmail', function () {
		beforeEach('create user', async function () {
			await createUser('test@gmail.com', 'test', '123123');
		})
		it('should send email', async function () {
			sinon.stub(mailer, 'send').returns(Promise.resolve());

			const requestPasswordRestoreEmailResponse = await agent.post('/api/users/requestPasswordRestoreEmail')
				.send({
					login: 'test'
				});

			requestPasswordRestoreEmailResponse.statusCode.should.be.equal(200);

			mailer.send.should.be.calledWithMatch('restore-password', 'test@gmail.com');

			mailer.send.restore();
		});
		it('should return 400 if user not exists', async function () {
			sinon.stub(mailer, 'send').returns(Promise.resolve());

			const requestPasswordRestoreEmailResponse = await agent.post('/api/users/requestPasswordRestoreEmail')
				.send({
					login: 'teasdasdasfsafsst'
				});

			requestPasswordRestoreEmailResponse.statusCode.should.be.equal(400);

			mailer.send.should.not.be.calledWithMatch('restore-password');

			mailer.send.restore();
		});
	});

	describe('POST /changePassword', function () {
		let email = 'test@test.com';
		let passwordRestoreToken;

		beforeEach('create user', async function () {
			await agent.post('/api/users/signup')
				.send({
					email: email,
					password: '123123123',
					username: 'test'
				});

			sinon.stub(mailer, 'send').returns(Promise.resolve());

			await agent.post('/api/users/requestPasswordRestoreEmail')
				.send({
					login: 'test'
				});

			passwordRestoreToken = mailer.send.firstCall.args[2].passwordRestoreToken;

			mailer.send.restore();
		});

		it('should change password', async function () {
			const activateResponse = await agent.post('/api/users/changePassword')
				.send({email, passwordRestoreToken, password: '123123123'});

			activateResponse.statusCode.should.be.equal(200);
		});
		it('should reject invalid token', async function () {
			const activateResponse = await agent.post('/api/users/changePassword')
				.send({email, passwordRestoreToken: '123', password: '123123123'});

			activateResponse.statusCode.should.be.equal(400);
		});
	});

	describe('POST /signin', function () {
		beforeEach('create user', async function () {
			await createAndActivateUser('test@gmail.com', 'test', '123123123')
		});

		it('should return Access-Token', async function () {
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
		beforeEach('create user', async function () {
			await createAndActivateUser('test@gmail.com', 'test', '123123123')
		});

		it('should return user', async function () {
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
		let accessToken;

		beforeEach('create user', async function () {
			await createAndActivateUser('test@gmail.com', 'test', '123123123')

			const signInResponse = await agent.post('/api/users/signin')
				.send({
					login: 'test@gmail.com',
					password: '123123123'
				});

			accessToken = signInResponse.body.access_token;
		});

		it('should update name', async function () {
			const updateMeResponse = await agent.post('/api/users/me')
				.set('Authorization', accessToken)
				.send({
					username: 'FooBar'
				});

			updateMeResponse.statusCode.should.be.equal(200);
			updateMeResponse.body.user.should.containEql({
				username: 'FooBar'
			});
		});

		it('should not update email', async function () {
			const updateMeResponse = await agent.post('/api/users/me')
				.set('Authorization', accessToken)
				.send({
					email: 'test2@gmail.com'
				});

			updateMeResponse.body.user.should.containEql({
				email: 'test@gmail.com'
			});
		});

		it('should update password', async function () {
			const updateMeResponse = await agent.post('/api/users/me')
				.set('Authorization', accessToken)
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

		it('should not update password if old password is wrong', async function () {
			const updateMeResponse = await agent.post('/api/users/me')
				.set('Authorization', accessToken)
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
