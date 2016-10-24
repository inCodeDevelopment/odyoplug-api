import supertest from 'supertest';
import sinon from 'sinon';
import app from 'app';
import mailer from 'mailer';

export async function createUser(email, username, password) {
	const agent = supertest(app);

	await agent.post('/api/users/signup')
		.send({
			email: email,
			password: password,
			username: username
		});
}

export async function createAndActivateUser(email, username, password, paypalReceiver) {
	const agent = supertest(app);

	sinon.stub(mailer, 'send').returns(Promise.resolve());

	await agent.post('/api/users/signup')
		.send({
			email: email,
			password: password,
			username: username
		});

	const activationToken = mailer.send.firstCall.args[2].activationToken;

	mailer.send.restore();

	await agent.post('/api/users/activate')
		.send({email, activationToken});

	const signInResponse = await agent.post('/api/users/signin')
		.send({
			login: email,
			password: password
		});

	const accessToken = signInResponse.body.access_token;

	const updateRes = await agent.post('/api/users/me')
		.set('Authorization', accessToken)
		.set('Password', password)
		.send({
			paypalReceiver: paypalReceiver || email
		});

	return accessToken;
}

export async function createBeat(accessToken, name) {
	const agent = supertest(app);

	const uploadBeatFileResponse = await agent.post('/api/beats/files')
		.set('Authorization', accessToken)
		.attach('beatFile', 'src/assets_test/audio.mp3')
		.send({});

	const licenses = await agent.get('/api/licenses')
		.set('Authorization', accessToken);
	const licenseId = licenses.body.licenses[0].id;

	const fileId = uploadBeatFileResponse.body.file.id;

	const createBeatResponse = await agent.post('/api/beats')
		.set('Authorization', accessToken)
		.send({
			name: name || "FooBar",
			tempo: 145,
			prices: {
				[licenseId]: 3.99
			},
			genreId: 13,
			fileId: fileId
		});

	return createBeatResponse.body.beat.id;
}
