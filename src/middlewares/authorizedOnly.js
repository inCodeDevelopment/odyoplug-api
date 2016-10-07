import { User } from 'db';
import { HttpError } from 'HttpError';

export default async function(req, res, next) {
	try {
		if (!req.user_id) {
			throw new HttpError(403, 'access_denied');
		}

		req.user = await User.findById(req.user_id);

		if (!req.user) {
			throw new HttpError(403, 'access_denied');
		}

		next();
	} catch (error) {
		next(error);
	}
}
