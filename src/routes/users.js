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

const users = Router();

users.post('/signup',
	validate({
		body: {
			required: ['username', 'email', 'password'],
			properties: {
				username: {
					type: 'string'
				},
				email: {
					type: 'string',
					pattern: '^[a-zA-Z0-9_\.\+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-\.]+$'
				},
				password: {
					type: 'string',
					minLength: 6
				}
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
				throw new HttpError(422, 'email_is_taken')
			} else {
				throw error;
			}
		}
	})
);

users.post('/signin',
	validate({
		body: {
			required: ['email', 'password'],
			properties: {
				email: {
					type: 'string',
					pattern: '^[a-zA-Z0-9_\.\+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-\.]+$'
				},
				password: {
					type: 'string',
					minLength: 6
				}
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
			throw new HttpError(400, 'user_not_found');
		}
	})
);

function redirectUser(req, res) {
	if (req.user.access_token) {
		res.redirect(config.get('socialAuth.callback') + '?' + qs.stringify({
			status: 'authroized',
			access_token: req.user.access_token
		}));
		return;
	}

	if (req.user.auth_code) {
		res.redirect(config.get('socialAuth.callback') + '?' + qs.stringify({
			status: 'not_authorized',
			auth_code: req.user.auth_code
		}));
		return;
	}
}

// Facebook
users.get('/signin/facebook',
	passport.authenticate('facebook', {
		session: false
	})
);
users.get('/signin/facebook/callback',
	passport.authenticate('facebook', {
		failureRedirect: config.get('socialAuth.callbackFailure'),
		session: false
	}),
	redirectUser
);

// Twitter
users.use('/signin/twitter',
	cookieSession({
		name: 'session',
		secret: config.get('cookieSessionSecret')
	})
);
users.get('/signin/twitter',
	passport.authenticate('twitter', {
		session: false
	})
);
users.get('/signin/twitter/callback',
	passport.authenticate('twitter', {
		failureRedirect: config.get('socialAuth.callbackFailure'),
		session: false
	}),
	redirectUser
);

// Google
users.get('/signin/google',
	passport.authenticate('google', {
		scope: 'profile',
		session: false
	})
);
users.get('/signin/google/callback',
	passport.authenticate('google', {
		failureRedirect: config.get('socialAuth.callbackFailure'),
		session: false
	}),
	redirectUser
);

users.post('/link',
	wrap(async function(req, res) {
		const authInfo = verifyToken(req.body.auth_code);

		// @TODO check if req.user[authInfo.path] exists
		req.user.set({
			[authInfo.path]: authInfo.social_id
		});

		await req.user.save();

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
			properties: {
				username: {
					type: 'string'
				},
				password: {
					type: 'string',
					minLength: 6
				}
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