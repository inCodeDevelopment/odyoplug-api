import jwt from 'jsonwebtoken';
import config from 'config';

export function sign(payload) {
	return jwt.sign(payload, config.get('jwt.secret'), {
		algorithm: 'HS256'
	});
}

export function verify(token) {
	return jwt.verify(token, config.get('jwt.secret'));
}