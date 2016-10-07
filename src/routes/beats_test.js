import config from 'config';
import supertest from 'supertest';
import { clear as clearDb } from 'dbUtils';
import app from 'app';
import should from 'should';

before(app.resolveWhenReady);
beforeEach(clearDb);

describe('api /beats', function () {
  describe('POST /files', function () {
    it('should upload file');
    it('shuld reject non mp3/waw files');
  });

	describe('POST /', function () {
    
	});
});
