import { HttpError } from 'HttpError';

function validate(schemas) {
	return function(req, res, next) {
		try {
			if (schemas.body) {
				req.checkBody(schemas.body);
			}

			const errors = req.validationErrors(true);

			if (errors) {
				next(new HttpError(400, 'invalid_input', {errors}));
			} else {
				next();
			}
		} catch (err) {
			next(err);
		}
	}
}

export default validate;