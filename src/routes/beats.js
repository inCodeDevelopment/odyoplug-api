import { Router } from 'express';
import config from 'config';
import { authorizedOnly, validate } from 'middlewares';
import sequelize from 'sequelize';
import _ from 'lodash';

import {
	uploader as beatFileUploader,
	storage as beatFileStorage
} from 'multers/beatFile';

import { Beat, BeatFile } from 'db';
import { HttpError } from 'HttpError';

import { wrap } from './utils';

const beats = Router();

beats.post('/',
  authorizedOnly,
  validate({
    body: {
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
      },
      price: {
        errorMessage: 'Invalid price'
      }
    }
  }),
  wrap(async function(req, res) {
		try {
	    const beat = await Beat.create({
	      ...req.body,
	      userId: req.user_id
	    });
	    res.send({
	  		beat: {
					...beat.toJSON(),
					file: await beat.getFile()
				}
	    });
		} catch (err) {
			if (err instanceof sequelize.ForeignKeyConstraintError) {
				const fKey = err.original.constraint.split('_')[1];

				throw new HttpError(400, 'invalid_input', {
					errors: {
						[fKey]: {
							msg: `Invalid ${fKey}`
						}
					}
				});
			}

			if (err instanceof sequelize.UniqueConstraintError &&
				_.some(err.errors, _.matches({
					type: 'unique violation',
					path: 'fileId'
				}))
			) {
				throw new HttpError(400, 'invalid_input', {
					errors: {
						fileId: {
							msg: 'This file already in use'
						}
					}
				});
			}

			throw err;
		}
  })
);

beats.get('/user/:userId',
	wrap(async function(req, res) {
		const beats = await Beat.findAll({
			where: {
				userId: req.params.userId
			},
			include: [
				{
					model: BeatFile,
					as: 'file'
				}
			]
		});

		res.status(200).json({beats});
	})
);

beats.get('/search',
	validate({
		query: {
			q: {
				errorMessage: 'Invalid query'
			},
			genreId: {
				isInt: {
					options: []
				},
				errorMessage: 'Invalid genre'
			}
		}
	}),
	wrap(async function(req, res) {
		const query = {
			name: {
				$iLike: `%${req.query.q}%`
			}
		};

		if (req.query.genreId) {
			query.genreId = req.query.genreId;
		}

		const freshBeats = await Beat.findAll({
			where: {
				...query,
				createdAt: {
					$gte: new Date(new Date() - config.get('search.fresh.days') * 24 * 60 * 60 * 1000)
				}
			},
			include: [
				{
					model: BeatFile,
					as: 'file'
				}
			],
			order: [
				['createdAt', 'DESC']
			],
			limit: config.get('search.fresh.limit')
		});

		const beats = await Beat.findAll({
			where: {
				...query,
				id: {
					$notIn: freshBeats.map(beat => beat.id)
				}
			},
			include: [
				{
					model: BeatFile,
					as: 'file'
				}
			],
			order: [
				['createdAt', 'DESC']
			]
		});

		res.status(200).json({freshBeats, beats});
	})
);

beats.post('/files',
  authorizedOnly,
  beatFileUploader.single('beatFile'),
	beatFileStorage.getFileInfo,
  wrap(async function(req, res) {
    const beatFile = await BeatFile.create({
      url: `/uploads/beats/${req.file.filename}`,
      duration: req.file.duration
    });

    res.status(200).json({
      file: beatFile
    })
  })
);

export default beats;
