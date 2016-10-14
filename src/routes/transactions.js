import { Router } from 'express';
import config from 'config';

import { Transaction } from 'db';

import { wrap } from './utils';

const transactions = Router();

transactions.get('/',
	wrap(async function(req, res) {
		// @TODO
	})
);

transactions.get('/:id',
	wrap(async function(req, res) {
		// @TODO
	})
);

export default transactions;
