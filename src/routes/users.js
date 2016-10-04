import { Router } from 'express';
import { authorizedOnly, validate } from 'middlewares';
import cookieSession from 'cookie-session';
import config from 'config';
import passport from 'passport';
import qs from 'querystring';

import { User } from 'db';

import { sign as signToken, verify as verifyToken } from 'token';
import { HttpError } from 'HttpError';
import { wrap } from './utils';
import _ from 'lodash';
import url from 'url';

const schemas = {
	username: {
		matches: {
			options: ['^[a-zA-Z0-9._]+$'],
			errorMessage: 'Username must consist of letters numbers dots and underscores only'
		},
		errorMessage: 'Invalid username'
	},
	password: {
		isLength: {
			options: [{min: 6}],
			errorMessage: 'Password must be at least 6 characters long'
		},
		errorMessage: 'Invalid password'
	},
	email: {
		matches: {
			options: ['^[a-zA-Z0-9_\.\+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-\.]+$']
		},
		errorMessage: 'Invalid email'
	}
};

async function catchUniqueConstraintError(promise) {
	try {
		return (await promise);
	} catch (error) {
		if (
			error.name === 'SequelizeUniqueConstraintError' &&
			_.some(error.errors, _.matches({
				type: 'unique violation',
				path: 'email'
			}))
		) {
			throw new HttpError(400, 'invalid_input', {
				errors: {
					email: {
						param: 'email',
						msg: 'Email is already in use',
						value: _.find(error.errors, {path: 'email'}).value
					}
				}
			});
		}

		if (
			error.name === 'SequelizeUniqueConstraintError' &&
			_.some(error.errors, _.matches({
				type: 'unique violation',
				path: 'username'
			}))
		) {
			throw new HttpError(400, 'invalid_input', {
				errors: {
					username: {
						param: 'username',
						msg: 'Username is taken',
						value: _.find(error.errors, {path: 'username'}).value
					}
				}
			})
		}

		throw error;
	}
}

const users = Router();

users.post('/signup',
	validate({
		body: {
			username: {
				...schemas.username,
				notEmpty: true
			},
			email: {
				...schemas.email,
				notEmpty: true
			},
			password: {
				...schemas.password,
				notEmpty: true
			}
		}
	}),
	wrap(async function(req, res) {
		const user = User.build({
			email: req.body.email,
			username: req.body.username
		});

		await user.setPassword(req.body.password);
		await catchUniqueConstraintError(
			user.save()
		);

		const access_token = signToken({
			user_id: user.id
		});

		res.status(201).json({
			access_token, user
		});
	})
);

users.post('/signin',
	validate({
		body: {
			login: {
				notEmpty: true,
				errorMessage: 'Invalid login'
			},
			password: {
				notEmpty: true,
				errorMessage: 'Invalid password'
			}
		}
	}),
	wrap(async function(req, res) {
		const query = req.body.login.indexOf('@') === -1
			? { username: req.body.login }
			: { email: req.body.login };

		const user = await User.findOne({
			where: query
		});

		if (user && await user.verifyPassword(req.body.password)) {
			const access_token = signToken({
				user_id: user.id
			});

			res.status(200).json({
				access_token, user
			});
		} else {
			throw new HttpError(404, 'user_not_found', {
				message: 'User with such email/username and password not found'
			});
		}
	})
);

users.use('/signin/:provider',
	cookieSession({
		name: 'session',
		secret: config.get('cookieSessionSecret')
	})
);

function storeReferer(req, res, next) {
	req.session.referer = req.get('Referrer');
	next();
}

function passportCallbackHandler(provider) {
	return (req, res, next) => {
		let failureCallback;

		if (config.get('socialAuth.resolveCallbackFromReferer')) {
			failureCallback = url.resolve(
				req.session.referer || '',
				config.get('socialAuth.callbackFailure')
			);
		} else {
			failureCallback = config.get('socialAuth.callbackFailure');
		}

		passport.authenticate(provider, {
			failureRedirect: failureCallback,
			session: false
		})(req, res, next);
	}
}

function redirectUser(req, res) {
	let callback;

	if (config.get('socialAuth.resolveCallbackFromReferer')) {
		callback = url.resolve(
			req.session.referer || '',
			config.get('socialAuth.callback')
		);
	} else {
		callback = config.get('socialAuth.callback');
	}
	
	res.redirect(callback + '?' + qs.stringify({
		status: 'authroized',
		access_token: req.user.access_token
	}));
}

// Facebook
users.get('/signin/facebook',
	storeReferer,
	passport.authenticate('facebook', {
		session: false
	})
);
users.get('/signin/facebook/callback',
	passportCallbackHandler('facebook'),
	redirectUser
);

// Twitter
users.get('/signin/twitter',
	storeReferer,
	passport.authenticate('twitter', {
		session: false
	})
);
users.get('/signin/twitter/callback',
	passportCallbackHandler('twitter'),
	redirectUser
);

// Google
users.get('/signin/google',
	storeReferer,
	passport.authenticate('google', {
		scope: 'profile',
		session: false
	})
);
users.get('/signin/google/callback',
	passportCallbackHandler('google'),
	redirectUser
);

users.get('/me',
	authorizedOnly,
	wrap(async function(req, res) {
		res.status(200).json({
			user: req.user
		});
	})
);

users.post('/me',
	authorizedOnly,
	validate({
		body: {
			password: {
				optional: true,
				...schemas.password
			},
			username: {
				optional: true,
				...schemas.username
			}
		}
	}),
	wrap(async function(req, res) {
		req.user.set(
			_.pick(req.body, ['username'])
		);

		if (req.body.password) {
			if (await req.user.verifyPassword(req.get('password'))) {
				await req.user.setPassword(req.body.password);
			} else {
				throw new HttpError(403, 'access_denied');
			}
		}

		await catchUniqueConstraintError(
			req.user.save()
		);

		res.status(200).json({
			user: req.user
		});
	})
);

export default users;