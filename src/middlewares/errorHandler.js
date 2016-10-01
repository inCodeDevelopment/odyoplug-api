import { HttpError } from 'HttpError';
import winston from 'winston';

export default function(err, req, res, next) {
	if (err instanceof HttpError) {
		res.status(err.statusCode).json({
			...err.payload,
			error: err.message
		});
	} else {
		winston.error('Internal server error', err);
		
		res.status(500).json({
			error: 'internal_server_error'
		});
	}
}