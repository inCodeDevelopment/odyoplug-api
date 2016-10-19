import ExtendableError from 'es6-error';

export class HttpError extends ExtendableError {
	constructor(statusCode, message, payload) {
		super(message);
		this.statusCode = statusCode;
		this.payload = payload;
	}
}

HttpError.invalidInput = function(field, msg, value) {
	return new HttpError(400, 'invalid_input', {
		errors: {
			[field]: {
				msg: msg,
				value: value
			}
		}
	});
};
