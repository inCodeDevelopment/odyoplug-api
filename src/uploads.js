import express from 'express';
import config from 'config';

const uploads = express.Router();

uploads.use(
	'/beats',
	express.static(config.get('beatFileStorage.destination'))
);

export default uploads;
