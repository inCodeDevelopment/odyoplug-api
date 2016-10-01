import { HttpError } from 'HttpError';
import Ajv from 'ajv';

function validate(schema) {
	const ajv = new Ajv({allErrors: true});
	const validator = ajv.compile(schema.body);

	return function(req, res, next) {
		try {
			const valid = validator(req.body);
			const errors = validator.errors;
			
			if (valid) {
				next();
			} else {
				next(new HttpError(400, 'invalid_input', {errors}))
			}
		} catch (err) {
			next(err);
		}
	}
}

export default validate;