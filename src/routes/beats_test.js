import config from 'config';
import supertest from 'supertest';
import { clear as clearDb } from 'dbUtils';
import app from 'app';
import should from 'should';

before(app.resolveWhenReady);
beforeEach(clearDb);

describe('api /beats', function () {
  let agent, accessToken;

  beforeEach(async function() {
    agent = supertest(app);

    const signUpReponse = await agent.post('/api/users/signup')
      .send({
        email: 'test@gmail.com',
        password: '123123123',
        username: 'test'
      });

    accessToken = signUpReponse.body.access_token;
  });

  describe('POST /files', function () {
    it('should upload file', async function() {
      const uploadBeatFileResponse = await agent.post('/api/beats/files')
        .set('Authorization', accessToken)
        .attach('beatFile', 'src/assets_test/audio.mp3')
        .send({});

      uploadBeatFileResponse.statusCode.should.be.equal(200);
      uploadBeatFileResponse.body.should.have.property('file');
      should(uploadBeatFileResponse.body.file.url).be.String();

      (await agent.get(uploadBeatFileResponse.body.file.url))
        .statusCode.should.be.equal(200);
    });

    it('should reject non mp3/waw files', async function() {
      const uploadBeatFileResponse = await agent.post('/api/beats/files')
        .set('Authorization', accessToken)
        .attach('beatFile', 'src/app.js')
        .send({});

      uploadBeatFileResponse.statusCode.should.be.equal(400);
      uploadBeatFileResponse.body.should.have.property('error');
      uploadBeatFileResponse.body.error.should.be.equal('file_is_not_allowed');
      uploadBeatFileResponse.body.errors.should.have.property('beatFile');
      uploadBeatFileResponse.body.errors.beatFile
        .errorMessage.should.be.equal('Only mp3 or wav files are allowed');
    });

    it('should calculate file duration', async function() {
      const uploadBeatFileResponse = await agent.post('/api/beats/files')
        .set('Authorization', accessToken)
        .attach('beatFile', 'src/assets_test/audio.mp3')
        .send({});

      uploadBeatFileResponse.statusCode.should.be.equal(200);
      uploadBeatFileResponse.body.should.have.property('file');
      uploadBeatFileResponse.body.file.duration.should.be.approximately(373, 1);
    })
  });

	describe('POST /', function () {
    let fileId;

    beforeEach(async function() {
      const uploadBeatFileResponse = await agent.post('/api/beats/files')
        .set('Authorization', accessToken)
        .attach('beatFile', 'src/assets_test/audio.mp3')
        .send({});

      fileId = uploadBeatFileResponse.body.file.id;
    });

    it('should create beat', async function() {
      const createBeatResponse = await agent.post('/api/beats')
        .set('Authorization', accessToken)
        .send({
          name: "FooBar",
          tempo: 145,
          price: 3.99,
          genreId: 13,
          fileId: fileId
        });

      createBeatResponse.statusCode.should.be.equal(200);
      const beat = createBeatResponse.body.beat;

      beat.should.containEql({
        genreId: 13,
        name: "FooBar",
        tempo: 145,
        price: 3.99
      });
      beat.should.have.properties('id', 'userId', 'createdAt', 'updatedAt');
    });
    it('should return file info');
    it('should reject beats with not-existing fileId', async function() {
      const createBeatResponse = await agent.post('/api/beats')
        .set('Authorization', accessToken)
        .send({
          name: "FooBar",
          tempo: 145,
          price: 3.99,
          genreId: 13,
          fileId: fileId+100
        });

      createBeatResponse.statusCode.should.be.equal(400);
      createBeatResponse.body.should.containEql({
        errors: {
          fileId: {
            msg: 'Invalid fileId'
          }
        }
      })
    });
    it('should reject beats with non-existing genre', async function() {
      const createBeatResponse = await agent.post('/api/beats')
        .set('Authorization', accessToken)
        .send({
          name: "FooBar",
          tempo: 145,
          price: 3.99,
          genreId: 1300,
          fileId: fileId
        });

      createBeatResponse.statusCode.should.be.equal(400);
      createBeatResponse.body.should.containEql({
        errors: {
          genreId: {
            msg: 'Invalid genreId'
          }
        }
      })
    });
    it('should accept only unique file ids', async function() {
      const createBeatResponse = await agent.post('/api/beats')
        .set('Authorization', accessToken)
        .send({
          name: "FooBar",
          tempo: 145,
          price: 3.99,
          genreId: 13,
          fileId: fileId
        });

      createBeatResponse.statusCode.should.be.equal(200);

      const createBeatResponse2 = await agent.post('/api/beats')
        .set('Authorization', accessToken)
        .send({
          name: "FooBar",
          tempo: 145,
          price: 3.99,
          genreId: 13,
          fileId: fileId
        });

      createBeatResponse2.statusCode.should.be.equal(400);
      createBeatResponse2.body.should.containEql({
        errors: {
          fileId: {
            msg: 'This file already in use'
          }
        }
      })
    });
	});
});