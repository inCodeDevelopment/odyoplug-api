import {Router} from 'express';
import {validate, authorizedOnly} from 'middlewares';
import {License} from 'db';
import {HttpError} from 'HttpError';
import _ from 'lodash';

import {wrap, catchSequelizeConstraintErrors} from './utils';

const inputLicenseSchema = {
	name: {
		errorMessage: 'Invalid license name'
	},
	mp3: {
		errorMessage: 'Invalid mp3 flag',
		isBoolean: true
	},
	wav: {
		errorMessage: 'Invalid wav flag',
		isBoolean: true
	},
	trackout: {
		errorMessage: 'Invalid trackout flag',
		isBoolean: true
	},
	discounts: {
		errorMessage: 'Invalid discounts flag',
		isBoolean: true
	},
	enabled: {
		errorMessage: 'Invalid enabled flag',
		isBoolean: true
	}
};

const inputLicenseFields = Object.keys(inputLicenseSchema);

const catchLicenseConstraintError = catchSequelizeConstraintErrors({});

const licenses = Router();

licenses.use(authorizedOnly);

licenses.get('/',
	wrap(async function (req, res) {
		const licenses = await req.user.getLicenses();

		res.status(200).json({licenses});
	})
);

licenses.post('/',
	validate({
		body: validate.notEmpty(inputLicenseSchema, Object.keys(inputLicenseSchema))
	}),
	wrap(async function (req, res) {
		const license = await req.user.createLicense({
			..._.pick(req.body, inputLicenseFields),
			default: false,
			userId: req.user_id
		}).catch(catchLicenseConstraintError);

		res.status(200).json({license})
	})
);

licenses.get('/:id(\\d+)',
	wrap(async function (req, res) {
		const license = await License
			.findOne({
				where: {
					id: req.params.id,
					userId: req.user_id
				}
			});

		if (!license) {
			throw new HttpError(403, 'access_denied');
		}

		res.status(200).json({license});
	})
);

licenses.post('/:id(\\d+)',
	validate({
		body: validate.optional(inputLicenseSchema, Object.keys(inputLicenseSchema))
	}),
	wrap(async function (req, res) {
		const [updated] = await License.update(
			_.pick(req.body, inputLicenseFields),
			{
				where: {
					id: req.params.id,
					userId: req.user_id
				}
			}
		).catch(catchLicenseConstraintError);

		if (!updated) {
			throw new HttpError(403, 'access_denied');
		}

		const license = await License.findById(req.params.id);
		res.status(200).json({license});
	})
);

licenses.delete('/:id(\\d+)',
	wrap(async function (req, res) {
		const deleted = await License.destroy({
			where: {
				id: req.params.id,
				userId: req.user_id,
				default: false
			}
		});

		if (!deleted) {
			throw new HttpError(403, 'access_denied');
		}

		res.status(200).send();
	})
);

export default licenses;
