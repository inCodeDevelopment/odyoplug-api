import express from 'express';
import config from 'config';
import contentDisposition from 'content-disposition';

const uploads = express.Router();

uploads.use(
	'/beats',
	express.static(config.get('beatFileStorage.destination'), {
		setHeaders(res, path) {
			res.setHeader(
				'Content-Disposition',
				contentDisposition(
					path.slice(path.indexOf('$_$')+1)
				)
			);
		}
	})
);

export default uploads;
