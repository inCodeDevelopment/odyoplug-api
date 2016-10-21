import supertest from 'supertest';
import app from 'app';
import rl from 'readline-sync';

import {createAndActivateUser, createBeat} from 'routes/testUtils';

(async() => {
	const agent = supertest(app);

	const accessToken = await createAndActivateUser('ec-merchant123123@gmail.com', 'ec_merchant', '123123');
	const accessTokenBuyer = await createAndActivateUser('ec-buyer@gmail.com', 'ec_buyer', '123123');

	const beatId = await createBeat(accessToken);
	const beatId2 = await createBeat(accessToken);
	const beatId3 = await createBeat(accessToken);

	await agent.post('/api/cart/my/addBeat')
		.set('Authorization', accessTokenBuyer)
		.send({
			beatId: beatId
		});

	await agent.post('/api/cart/my/addBeat')
		.set('Authorization', accessTokenBuyer)
		.send({
			beatId: beatId2
		});

	await agent.post('/api/cart/my/addBeat')
		.set('Authorization', accessTokenBuyer)
		.send({
			beatId: beatId3
		});

	const createTransaction = await agent.post('/api/transactions/cart')
		.set('Authorization', accessTokenBuyer)
		.send();

	console.log(createTransaction.body)

	const ecToken = rl.question('Token please: ');

	const finalizeTransaction = await agent.post('/api/transactions/finalizeByPayPalECToken')
		.set('Authorization', accessTokenBuyer)
		.send({
			ecToken: ecToken
		});

	console.log(JSON.stringify(finalizeTransaction.body, null, 2))
})();
