import sequelize from 'sequelize';
import {HttpError} from 'HttpError';
import _ from 'lodash';

export function wrap(handler) {
	return (req, res, next) => handler(req, res)
		.then(() => {
			if (!req.stop) {
				next();
			}
		})
		.catch(next);
}

export function catchSequelizeConstraintErrors(errorMessages) {
	return function (error) {
		for (const errorKey of Object.keys(errorMessages)) {
			const [type, field] = errorKey.split(':');

			if (type === 'fKey' && error instanceof sequelize.ForeignKeyConstraintError) {
				const fKey = error.original.constraint.split('_')[1];

				if (fKey === field) {
					throw HttpError.invalidInput(
						field,
						errorMessages[errorKey],
						this.get('field')
					);
				}
			}

			if (type === 'unique' && error instanceof sequelize.UniqueConstraintError) {
				const uniqueViolationError = _.find(error.errors, {
					type: 'unique violation',
					path: field
				});

				if (uniqueViolationError) {
					throw HttpError.invalidInput(
						field,
						errorMessages[errorKey],
						this.get(field)
					);
				}
			}
		}

		throw error;
	}
}