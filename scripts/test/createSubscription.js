import supertest from 'supertest';
import app from 'app';
import rl from 'readline-sync';

import {createAndActivateUser, createBeat} from 'routes/testUtils';

(async() => {
	const agent = supertest(app);

	const accessToken = await createAndActivateUser('ec-merchant123123@gmail.com', 'ec_merchant', '123123');

	const createSubscription = await agent.post('/api/subscription/initialize')
		.set('Authorization', accessToken)
		.send({
			rate: 'premium',
			period: 'month'
		});

	console.log(createSubscription.body);

	const ecToken = rl.question('Token please: ');

	const finalizeSubsciption = await agent.post('/api/subscription/finalize')
		.set('Authorization', accessToken)
		.send({
			ecToken: ecToken
		});

	console.log(JSON.stringify(finalizeSubsciption.body, null, 2))
})();
