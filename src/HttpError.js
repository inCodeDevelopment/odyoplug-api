import ExtendableError from 'es6-error';

export class HttpError extends ExtendableError {
	constructor(statusCode, message, payload) {
		super(message);
		this.statusCode = statusCode;
		this.payload = payload;
	}
}
