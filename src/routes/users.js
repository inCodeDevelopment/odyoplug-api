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

const users = Router();

users.post('/signup',
	validate({
		body: {
			username: {
				notEmpty: true,
				errorMessage: 'Invalid username'
			},
			email: {
				notEmpty: true,
				matches: {
					options: ['^[a-zA-Z0-9_\.\+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-\.]+$']
				},
				errorMessage: 'Invalid email'
			},
			password: {
				notEmpty: true,
				isLength: {
					options: [{min: 6}],
					errorMessage: 'Password must be at least 6 characters long'
				},
				errorMessage: 'Invalid password'
			}
		}
	}),
	wrap(async function(req, res) {
		try {
			const user = User.build({
				email: req.body.email,
				username: req.body.username
			});

			await user.setPassword(req.body.password);
			await user.save();

			const access_token = signToken({
				user_id: user.id
			});

			res.status(201).json({
				access_token, user
			});
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
							value: req.body.email
						}
					}
				})
			} else {
				throw error;
			}
		}
	})
);

users.post('/signin',
	validate({
		body: {
			email: {
				notEmpty: true,
				matches: {
					options: ['^[a-zA-Z0-9_\.\+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-\.]+$']
				},
				errorMessage: 'Invalid email'
			},
			password: {
				notEmpty: true,
				errorMessage: 'Invalid password'
			}
		}
	}),
	wrap(async function(req, res) {
		const user = await User.findOne({
			where: {
				email: req.body.email
			}
		});

		if (user && await user.verifyPassword(req.body.password)) {
			const access_token = signToken({
				user_id: user.id
			});

			res.status(200).json({
				access_token, user
			});
		} else {
			throw new HttpError(400, 'invalid_input', {
				errors: {
					_form: {
						msg: 'User not found'
					}
				}
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

		passport.authenticate('provider', {
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
	
	if (req.user.access_token) {
		res.redirect(callback + '?' + qs.stringify({
			status: 'authroized',
			access_token: req.user.access_token
		}));
		return;
	}

	if (req.user.auth_code) {
		res.redirect(callback + '?' + qs.stringify({
			status: 'not_authorized',
			auth_code: req.user.auth_code
		}));
		return;
	}
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
	passportCallbackHandler('facebook'),
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
	passportCallbackHandler('facebook'),
	redirectUser
);

users.post('/link',
	wrap(async function(req, res) {
		const authInfo = verifyToken(req.body.auth_code);

		if (req.user[authInfo.path]) {
			throw new HttpError(422, `${authInfo.path}_is_already_assigned`);	
		}


		try {
			await req.user.update({
				[authInfo.path]: authInfo.social_id
			});
		} catch (error) {
			if (
				error.name === 'SequelizeUniqueConstraintError' &&
				_.some(error.errors, _.matches({
					type: 'unique violation'
				}))
			) {
				throw new HttpError(400, '${authInfo}_is_already_assigned_to_another_account');
			} else {
				throw error;
			}
		}

		res.status(200).json({
			user: req.user
		});
	})
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
				errorMessage: 'Invalid password'
			}
		}
	}),
	wrap(async function(req, res) {
		await req.user.update(
			_.pick(req.body, ['username'])
		);

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

		await req.user.save();

		res.status(200).json({
			user: req.user
		});
	})
);

export default users;