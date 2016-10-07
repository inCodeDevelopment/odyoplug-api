import config from 'config';

import multer from 'multer';
import sha1 from 'sha1';
import mimeTypes from 'mime-types';
import fs from 'fs-promise';
import { HttpError } from 'HttpError';

export const storage = multer.diskStorage({
	destination(req, file, cb) {
		cb(null, config.get('beatFileStorage.destination'))
	},

	filename(req, file, cb) {
		const extension = mimeTypes.extension(file.mimetype);

		cb(null, `${sha1(req.user_id + file.originalname)}.${extension}`);
	}
});

storage.destroy = async function(filename) {
	await fs.unlink(config.get('beatFileStorage.destination') + '/' + filename);
};

export const uploader = multer({
	storage: storage,
	fileFilter(req, file, cb) {
		if (!config.get('beatFileStorage.allowedMimeTypes').includes(file.mimetype)) {
			cb(new HttpError(400, 'file_is_not_allowed', {
				allowedMimeTypes: config.get('beatFileStorage.allowedMimeTypes'),
				errors: {
					beatFile: {
						errorMessage: "Only mp3 or wav files are allowed"
					}
				}
			}))
		} else {
			cb(null, true);
		}
	},
	limits: {
		fileSize: 10 * 1024 * 1024
	}
});
