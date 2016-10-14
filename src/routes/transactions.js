import { Router } from 'express';
import { validate, authorizedOnly } from 'middlewares';
import { HttpError } from 'HttpError';
import config from 'config';

import { Transaction, Beat, BeatFile } from 'db';

import { wrap } from './utils';

const transactions = Router();

transactions.get('/',
	authorizedOnly,
	wrap(async function(req, res) {
		const transactions = await Transaction.scope('with:beats').findAll({
			where: {
				userId: req.user_id
			}
		});

		res.status(200).json({transactions});
	})
);

transactions.get('/:id',
	authorizedOnly,
	wrap(async function(req, res) {
		const transaction = await Transaction.scope('with:beats').findOne({
			where: {
				userId: req.user_id,
				id: req.params.id
			}
		});

		if (!transaction) {
			throw new HttpError(404, 'not_found');
		}

		res.status(200).json({transaction});
	})
);

export default transactions;
