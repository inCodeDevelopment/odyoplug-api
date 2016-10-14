import config from 'config';
import supertest from 'supertest';
import { clear as clearDb } from 'dbUtils';
import app from 'app';
import should from 'should';

const agent = supertest(app);

before(app.resolveWhenReady);
beforeEach(clearDb);

describe('api /ipn', function () {
	describe('POST /beatsPurchase', function () {
		it('should change transaction status to success');
		it('should clear shopping cart');
		it('should return error if transactionId is not provided');
		it('should do nothing if transaction handled already');
		it('should return error if transaction amount does not match ipn amount');
		it('should return error if transaction not found');
		it('should set transaction status to fail if payment_status is Failed or Denied');
		it('should create transaction for seller');
	});
});
