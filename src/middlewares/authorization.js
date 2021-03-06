import {verify} from 'token';
import { HttpError } from 'HttpError';

export default function(req, res, next) {
	const authorizationToken = req.get('Authorization');
	if (authorizationToken) {
		try {
			const payload = verify(authorizationToken);
			req.user_id = payload.user_id;
			next();
		} catch (error) {
			next(new HttpError(400, 'invalid_token'));
		}
	} else {
		req.user_id = null;
		next();
	}
}
