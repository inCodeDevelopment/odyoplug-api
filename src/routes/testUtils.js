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

export async function createAndActivateUser(email, username, password) {
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

  return signInResponse.body.access_token;
}
