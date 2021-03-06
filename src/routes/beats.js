import {Router} from 'express';
import config from 'config';
import {authorizedOnly, validate} from 'middlewares';
import _ from 'lodash';
import date from 'date.js';

import {
	uploader as beatFileUploader,
	storage as beatFileStorage
} from 'multers/beatFile';

import {Beat, BeatFile} from 'db';
import {HttpError} from 'HttpError';

import {wrap, catchSequelizeConstraintErrors} from './utils';

const inputBeatSchema = {
	name: {
		errorMessage: 'Invalid beat name'
	},
	tempo: {
		errorMessage: 'Invalid tempo'
	},
	genreId: {
		errorMessage: 'Invalid genre'
	},
	fileId: {
		errorMessage: 'Invalid fileId'
	}
};

const inputBeatFields = _.keys(inputBeatSchema);

const catchBeatConstraintErrors = catchSequelizeConstraintErrors({
	'fKey:genreId': 'Invalid genreId',
	'fKey:fileId': 'Invalid fileId',
	'unique:fileId': 'This file is already in use'
});

const beats = Router();

beats.post('/',
	authorizedOnly,
	validate({
		body: validate.notEmpty(inputBeatSchema, inputBeatFields)
	}),
	wrap(async function (req, res) {
		if (!req.body.prices) {
			throw new HttpError.invalidInput('prices', 'Invalid prices object', req.body.prices);
		}

		for (const licenseId of _.keys(req.body.prices)) {
			if (!(await req.user.hasLicense(licenseId))) {
				throw new HttpError.invalidInput('prices', 'Invalid prices object', req.body.prices);
			}
		}

		const beat = await req.user.createBeat({
			..._.pick(req.body, inputBeatFields),
			prices: req.body.prices,
			basePrice: _.min(
				_.values(req.body.prices)
			)
		}).catch(catchBeatConstraintErrors);

		beat.setDataValue('file', await beat.getFile());

		res.status(200).json({beat});
	})
);

beats.get('/user/:userId',
	wrap(async function (req, res) {
		const beats = await Beat
			.scope('orderBy:createdAt_desc', 'with:file', 'with:user')
			.findAll({
				where: {
					userId: req.params.userId
				}
			});

		res.status(200).json({beats});
	})
);

beats.get('/search',
	validate({
		query: {
			q: {
				optional: true,
				errorMessage: 'Invalid query'
			},
			genreId: {
				optional: true,
				isInt: true,
				errorMessage: 'Invalid genre'
			}
		}
	}),
	wrap(async function (req, res) {
		const query = {};

		if (req.query.q) {
			query.name = {
				$iLike: `%${req.query.q}%`
			};
		}

		if (req.query.genreId) {
			query.genreId = req.query.genreId;
		}

		const freshBeats = await Beat
			.scope('orderBy:createdAt_desc', 'with:file', 'with:user')
			.findAll({
				where: {
					...query,
					createdAt: {
						$gte: date(`${config.search.fresh.days} days ago`)
					}
				},
				limit: config.get('search.fresh.limit')
			});

		const beats = await Beat
			.scope('orderBy:createdAt_desc', 'with:file', 'with:user')
			.findAll({
				where: {
					...query,
					id: {
						$notIn: _.map(freshBeats, '_')
					}
				}
			});

		res.status(200).json({freshBeats, beats});
	})
);

beats.post('/files',
	authorizedOnly,
	beatFileUploader.single('beatFile'),
	beatFileStorage.getFileInfo,
	wrap(async function (req, res) {
		const beatFile = await BeatFile.create({
			url: `/uploads/beats/${req.file.filename}`,
			duration: req.file.duration
		});

		res.status(200).json({file: beatFile});
	})
);

beats.post('/:id(\\d+)',
	authorizedOnly,
	validate({
		body: inputBeatSchema
	}),
	wrap(async function (req, res) {
		const update = _.pick(req.body, inputBeatFields);
		if (req.body.prices) {
			for (const licenseId of _.keys(req.body.prices)) {
				if (!(await req.user.hasLicense(licenseId))) {
					throw new HttpError(403, 'access_denied');
				}
			}

			update.prices = req.body.prices;
			update.basePrice = _.min(
				_.values(req.body.prices)
			);
		}

		const [updated] = await Beat.update(update, {
			where: {
				userId: req.user_id,
				id: req.params.id
			}
		}).catch(catchBeatConstraintErrors);

		if (!updated) {
			throw new HttpError(403, 'access_denied');
		}

		const beat = await Beat.scope('with:file').findById(req.params.id);
		res.status(200).json({beat});
	})
);

beats.delete('/:id(\\d+)',
	authorizedOnly,
	wrap(async function (req, res) {
		const deleted = await Beat.destroy({
			where: {
				id: req.params.id,
				userId: req.user_id
			}
		});

		if (!deleted) {
			throw new HttpError(403, 'access_denied');
		}

		res.status(200).send();
	})
);

export default beats;
