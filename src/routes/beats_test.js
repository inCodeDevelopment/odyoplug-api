import config from 'config';
import supertest from 'supertest';
import { clear as clearDb } from 'dbUtils';
import { createAndActivateUser } from './testUtils';
import app from 'app';
import should from 'should';

const agent = supertest(app);

before(app.resolveWhenReady);
beforeEach(clearDb);

describe('api /beats', function () {
  let accessToken;

  beforeEach(async function() {
    accessToken = await createAndActivateUser('test@gmail.com', 'test', '123123');
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
      beat.file.should.containEql({
        id: fileId
      });
    });
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

  describe('GET /user/{userId}', function () {
    let userId;

    beforeEach(async function() {
      for (let i=0 ; i<3 ; i++) {
        const res = await agent.post('/api/beats')
          .set('Authorization', accessToken)
          .send({
            name: "FooBar",
            tempo: 145,
            price: 3.99,
            genreId: 13,
            fileId: (await agent.post('/api/beats/files')
              .set('Authorization', accessToken)
              .attach('beatFile', 'src/assets_test/audio.mp3')
              .send({})).body.file.id
          });
        userId = res.body.beat.userId;
      }
    })
    it('should return list of user beats', async function() {
      const getBeatsByUserResponse = await agent.get(`/api/beats/user/${userId}`);

      getBeatsByUserResponse.statusCode.should.be.equal(200);
      getBeatsByUserResponse.body.beats.length.should.be.equal(3);
      getBeatsByUserResponse.body.beats[0].should.have.property('file');
    });
  });

  describe('GET /search', function () {
    beforeEach(async function() {
      const beats = [
        {name: 'Foo Bar', genreId: 2},
        {name: 'Hello World', genreId: 2},
        {name: 'Hello test', genreId: 3},
        {name: 'Bar Baz', genreId: 3},
        {name: 'Bye World', genreId: 3}
      ];

      for (let beat of beats) {
        await agent.post('/api/beats')
          .set('Authorization', accessToken)
          .send({
            ...beat,
            tempo: 145,
            price: 3.99,
            fileId: (await agent.post('/api/beats/files')
              .set('Authorization', accessToken)
              .attach('beatFile', 'src/assets_test/audio.mp3')
              .send({})).body.file.id
          });
      }
    })
    it('should filter beats by query', async function() {
      const getBeatsByUserResponse = await agent.get(`/api/beats/search?q=world`);

      getBeatsByUserResponse.statusCode.should.be.equal(200);
      getBeatsByUserResponse.body.freshBeats.length.should.be.equal(2);
      getBeatsByUserResponse.body.freshBeats[0].should.have.property('file');
    });
    it('should filter beats by query and genreId', async function() {
      const getBeatsByUserResponse = await agent.get(`/api/beats/search?q=world&genreId=3`);

      getBeatsByUserResponse.statusCode.should.be.equal(200);
      getBeatsByUserResponse.body.freshBeats.length.should.be.equal(1);
      getBeatsByUserResponse.body.freshBeats[0].should.have.property('file');
    });
    it('should include both fresh and other beats', async function() {
      const getBeatsByUserResponse = await agent.get(`/api/beats/search?q=world`);
      getBeatsByUserResponse.body.should.have.property('freshBeats');
      getBeatsByUserResponse.body.should.have.property('beats');
    });
  });
});
