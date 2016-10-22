import { Router } from 'express';

import { Genre } from 'db';

import { wrap } from './utils';

const genres = Router();

genres.get('/',
	wrap(async function(req, res) {
		const genres = await Genre.findAll();

		res.send({genres});
	})
);

export default genres;
