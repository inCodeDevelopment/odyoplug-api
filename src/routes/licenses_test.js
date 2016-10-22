import supertest from 'supertest';
import {clear as clearDb} from 'dbUtils';
import app from 'app';
import {createAndActivateUser} from './testUtils';

const agent = supertest(app);

before(app.resolveWhenReady);
beforeEach(clearDb);

describe('api /licenses', function () {
	let accessToken;
	let accessToken2;

	beforeEach(async function () {
		accessToken = await createAndActivateUser('test@gmail.com', 'test', '123123');
		accessToken2 = await createAndActivateUser('test1@gmail.com', 'test1', '123123');
	});

	describe('POST /', function () {
		it('should create license', async function () {
			const createLicense = await agent.post('/api/licenses')
				.set('Authorization', accessToken)
				.send({
					name: 'Foo bar',
					mp3: true,
					wav: false,
					trackout: true,
					discounts: true,
					enabled: true
				});

			createLicense.statusCode.should.be.equal(200);
			createLicense.body.should.have.property('license');
			createLicense.body.license.should.have.property('id');
		});
	});

	describe('GET /', function () {
		it('should have 3 default licenses', async function () {
			const licenses = await agent.get('/api/licenses')
				.set('Authorization', accessToken);

			licenses.statusCode.should.be.equal(200);
			licenses.body.should.have.property('licenses');
			licenses.body.licenses.length.should.be.equal(3);
		});
		it('should return list of licenses', async function () {
			await agent.post('/api/licenses')
				.set('Authorization', accessToken)
				.send({
					name: 'Foo bar',
					mp3: true,
					wav: false,
					trackout: true,
					discounts: true,
					enabled: true
				});
			await agent.post('/api/licenses')
				.set('Authorization', accessToken)
				.send({
					name: 'Foo baz',
					mp3: true,
					wav: false,
					trackout: true,
					discounts: true,
					enabled: true
				});

			const licenses = await agent.get('/api/licenses')
				.set('Authorization', accessToken);

			licenses.statusCode.should.be.equal(200);
			licenses.body.should.have.property('licenses');
			licenses.body.licenses.length.should.be.equal(5);
		});
	});

	describe('GET /:id', function () {
		let licenseId;

		beforeEach(async function () {
			const createLicense = await agent.post('/api/licenses')
				.set('Authorization', accessToken)
				.send({
					name: 'Foo bar',
					mp3: true,
					wav: false,
					trackout: true,
					discounts: true,
					enabled: true
				});

			licenseId = createLicense.body.license.id;
		});

		it('should get license by id', async function () {
			const getLicense = await agent.get(`/api/licenses/${licenseId}`)
				.set('Authorization', accessToken);

			getLicense.statusCode.should.be.equal(200);
			getLicense.body.should.have.property('license');
			getLicense.body.license.id.should.be.equal(licenseId);
		});
		it('should return 403 on attempt to read others license', async function () {
			const getLicense = await agent.get(`/api/licenses/${licenseId}`)
				.set('Authorization', accessToken2);

			getLicense.statusCode.should.be.equal(403);
		});
	});

	describe('POST /:id', function () {
		let licenseId;

		beforeEach(async function () {
			const createLicense = await agent.post('/api/licenses')
				.set('Authorization', accessToken)
				.send({
					name: 'Foo bar',
					mp3: true,
					wav: false,
					trackout: true,
					discounts: true,
					enabled: true
				});

			licenseId = createLicense.body.license.id;
		});

		it('should update license', async function () {
			const updateLicense = await agent.post(`/api/licenses/${licenseId}`)
				.set('Authorization', accessToken)
				.send({
					name: 'Hello World!'
				});

			updateLicense.statusCode.should.be.equal(200);
			updateLicense.body.should.have.property('license');
			updateLicense.body.license.name.should.be.equal('Hello World!');
		});
		it('should return 403 on attempt to read others license', async function () {
			const updateLicense = await agent.post(`/api/licenses/${licenseId}`)
				.set('Authorization', accessToken2)
				.send({
					name: 'Hello World!'
				});

			updateLicense.statusCode.should.be.equal(403);
		});
	});

	describe('DELETE /:id', function () {
		let licenseId;

		beforeEach(async function () {
			const createLicense = await agent.post('/api/licenses')
				.set('Authorization', accessToken)
				.send({
					name: 'Foo bar',
					mp3: true,
					wav: false,
					trackout: true,
					discounts: true,
					enabled: true
				});

			licenseId = createLicense.body.license.id;
		});

		it('should delete license', async function () {
			const deleteLicense = await agent.delete(`/api/licenses/${licenseId}`)
				.set('Authorization', accessToken);

			deleteLicense.statusCode.should.be.equal(200);
		});
		it('should return 403 on attempt to delete others license', async function () {
			const deleteLicense = await agent.delete(`/api/licenses/${licenseId}`)
				.set('Authorization', accessToken2);

			deleteLicense.statusCode.should.be.equal(403);
		});
		it('should return 403 on attempt to delete default license', async function () {
			const licenses = await agent.get('/api/licenses')
				.set('Authorization', accessToken);

			const defaultLicenseId = licenses.body.licenses[0].id;

			const deleteLicense = await agent.delete(`/api/licenses/${defaultLicenseId}`)
				.set('Authorization', accessToken);

			deleteLicense.statusCode.should.be.equal(403);
		});
	});
});
