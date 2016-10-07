import { Router } from 'express';
import config from 'config';
import { authorizedOnly, validate } from 'middlewares';

import {
	uploader as beatFileUploader,
	storage as beatFileStorage
} from 'multers/beatFile';

import { Beat, BeatFile } from 'db';

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
    const beat = await Beat.create({
      ...req.body,
      userId: req.user_id
    });

    res.send({
      beat
    })
  })
);

beats.post('/files',
  authorizedOnly,
  beatFileUploader.single('beatFile'),
  wrap(async function(req, res) {
    const beatFile = await BeatFile.create({
      url: `/uploads/beats/${req.file.filename}`,
      duration: 0 // @TODO
    });

    res.status(200).json({
      file: beatFile
    })
  })
);

export default beats;
