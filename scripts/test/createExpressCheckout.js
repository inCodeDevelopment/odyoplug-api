import supertest from 'supertest';
import { clear as clearDb } from 'dbUtils';
import app from 'app';
import rl from 'readline-sync';

import { createAndActivateUser, createBeat } from 'routes/testUtils';

(async () => {
  const agent = supertest(app);

  const accessToken = await createAndActivateUser('ec-merchant@gmail.com', 'ec_merchant', '123123');
  const accessTokenBuyer = await createAndActivateUser('ec-buyer@gmail.com', 'ec_buyer', '123123');

  const beatId = await createBeat(accessToken);

  const addBeat = await agent.post('/api/cart/my/addBeat')
    .set('Authorization', accessTokenBuyer)
    .send({
      beatId: beatId
    });

  const createTransaction = await agent.post('/api/cart/my/transaction')
    .set('Authorization', accessTokenBuyer)
    .send();

  console.log(createTransaction.body)

  const ecToken = rl.question('Token please: ');

  const finalizeTransaction = await agent.post('/api/transactions/finalizeByPayPalECToken')
    .set('Authorization', accessTokenBuyer)
    .send({
      ecToken: ecToken
    });

  console.log(finalizeTransaction.body)
})();
