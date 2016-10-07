import config from 'config';

import multer from 'multer';
import sha1 from 'sha1';
import mimeTypes from 'mime-types';
import fs from 'fs-promise';
import { HttpError } from 'HttpError';
import ffprobe from 'node-ffprobe';

export const storage = multer.diskStorage({
	destination(req, file, cb) {
		cb(null, config.get('beatFileStorage.destination'))
	},

	filename(req, file, cb) {
		let originalname;

		if (file.originalname) {
			originalname = file.originalname;
		} else {
			originalname = 'audio.' + mimeTypes.extension(file.mimetype);
		}

		cb(null, `${sha1(req.user_id + file.originalname + Date.now())}$_$${originalname}`);
	}
});

storage.destroy = async function(filename) {
	await fs.unlink(config.get('beatFileStorage.destination') + '/' + filename);
};

storage.getFileInfo = function(req, res, next) {
	ffprobe(req.file.path, (err, info) => {
		if (err) {
			return next(err);
		}

		try {
			req.file.duration = info.format.duration;
		} catch (err) {
			return next(err);
		}

		next(null);
	});
}

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
