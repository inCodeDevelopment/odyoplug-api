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
