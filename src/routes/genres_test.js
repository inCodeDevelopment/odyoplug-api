import config from 'config';
import supertest from 'supertest';
import { clear as clearDb } from 'dbUtils';
import app from 'app';
import should from 'should';

const agent = supertest(app);

before(app.resolveWhenReady);
beforeEach(clearDb);

describe('api /genres', function () {
	describe('GET /', function () {
		it('should return list of genres', async function() {
			const getGenresResponse = await agent.get('/api/genres');

			getGenresResponse.statusCode.should.be.equal(200);
			getGenresResponse.body.should.have.property('genres');
			getGenresResponse.body.genres.should.be.Array();
		});
	});
});
