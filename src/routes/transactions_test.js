import config from 'config';
import supertest from 'supertest';
import { clear as clearDb } from 'dbUtils';
import app from 'app';
import should from 'should';

const agent = supertest(app);

before(app.resolveWhenReady);
beforeEach(clearDb);

describe('api /transactions', function () {
	describe('GET /', function () {
		it('should return list of transactions');
	});

	describe('GET /:id', function () {
		it('should return single transaction');
		it('should return 403 on attempt to read others transaction');
	})
});
