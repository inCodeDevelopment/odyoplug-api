import {HttpError} from 'HttpError';
import _ from 'lodash';

function validate(inputSchemas) {
	let schemas = {};

	for (const source of Object.keys(inputSchemas)) {
		if (inputSchemas[source] instanceof Schema) {
			schemas[source] = inputSchemas[source].schema;
		} else {
			schemas[source] = inputSchemas[source];
		}
	}

	return function (req, res, next) {
		try {
			if (schemas.body) {
				req.checkBody(schemas.body);
			}

			if (schemas.query) {
				req.checkQuery(schemas.query);
			}

			if (schemas.params) {
				req.checkParams(schemas.params);
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

class Schema {
	constructor(schema) {
		this.schema = schema;
	}

	only(fields) {
		return new Schema(_.pick(this.schema, fields));
	}

	notEmpty(fields) {
		let notEmptySchema = {};

		for (const field of fields) {
			notEmptySchema[field] = {notEmpty: true};
		}

		return new Schema(_.merge({}, this.schema, notEmptySchema));
	}

	optional(fields) {
		let optionalSchema = {...this.schema};

		for (const field of fields) {
			optionalSchema[field] = {
				optional: true,
				...optionalSchema[field]
			};
		}

		return new Schema(optionalSchema);
	}
}

validate.only = function (inputSchema, fields) {
	return new Schema(inputSchema).only(fields);
};

validate.notEmpty = function (inputSchema, fields) {
	return new Schema(inputSchema).notEmpty(fields);
};

validate.optional = function (inputSchema, fields) {
	return new Schema(inputSchema).optional(fields);
};

export default validate;
