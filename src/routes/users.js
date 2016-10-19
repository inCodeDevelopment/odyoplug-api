import {Router} from 'express';
import {authorizedOnly, validate} from 'middlewares';
import cookieSession from 'cookie-session';
import config from 'config';
import passport from 'passport';
import qs from 'querystring';

import {User} from 'db';

import {sign as signToken} from 'token';
import {HttpError} from 'HttpError';
import {wrap, catchSequelizeConstraintErrors} from './utils';
import _ from 'lodash';
import url from 'url';
import uuid from 'node-uuid';
import mailer from 'mailer';

const userFields = {
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
	},
	paypalReceiver: {
		matches: {
			options: ['^[a-zA-Z0-9_\.\+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-\.]+$']
		},
		errorMessage: 'Invalid paypal receiver email'
	},
	activationToken: {
		errorMessage: 'Invalid activation token',
	},
	passwordRestoreToken: {
		errorMessage: 'Invalid password restore token',
	},
	login: {
		errorMessage: 'Invalid login'
	}
};

const inputUserSchema = {
	username: userFields.username,
	password: userFields.password,
	email: userFields.email,
	paypalReceiver: userFields.paypalReceiver
};

const catchUserConstraintErrors = catchSequelizeConstraintErrors({
	'unique:email': 'Email is already in use',
	'unique:username': 'Username is taken'
});

const users = Router();

users.post('/signup',
	validate({
		body: validate.notEmpty(
			inputUserSchema,
			['username', 'email', 'password']
		).only(['username', 'email', 'password'])
	}),
	wrap(async function (req, res) {
		const user = User.build({
			email: req.body.email,
			username: req.body.username,
			active: false,
			activationToken: uuid.v4()
		});

		await user.setPassword(req.body.password);
		await user.save().catch(catchUserConstraintErrors);

		await mailer.sendUserActivation(user, {
			baseURL: req.baseURL
		});

		res.status(201).json({user});
	})
);

users.post('/requestActivationEmail',
	validate({
		body: validate.notEmpty({
			login: userFields.login
		}, ['login'])
	}),
	wrap(async function (req, res) {
		const user = await User.findByLogin(req.body.login);

		if (!user) {
			throw HttpError.invalidInput('login', 'User not found');
		}

		user.activationToken = uuid.v4();
		await user.save();

		await mailer.sendUserActivation(user, {
			baseURL: req.baseURL
		});

		res.status(200).json({status: 'sent'});
	})
);

users.post('/requestPasswordRestoreEmail',
	validate({
		body: validate.notEmpty({
			login: userFields.login
		}, ['login'])
	}),
	wrap(async function (req, res) {
		const user = await User.findByLogin(req.body.login);

		if (!user) {
			throw HttpError.invalidInput('login', 'User not found');
		}

		user.passwordRestoreToken = uuid.v4();
		await user.save();

		await mailer.sendRestorePassword(user, {
			baseURL: req.baseURL
		});

		res.status(200).json({status: 'sent'});
	})
);

users.post('/activate',
	validate({
		body: validate.notEmpty({
			email: userFields.email,
			activationToken: userFields.activationToken
		}, ['email', 'activationToken'])
	}),
	wrap(async function (req, res) {
		const user = await User.findOne({
			where: {
				email: req.body.email,
				activationToken: req.body.activationToken
			}
		});

		if (!user) {
			throw new HttpError(400, 'invalid_activation_token');
		}

		await user.update({
			active: true,
			activationToken: null
		});

		res.status(200).json({
			status: 'activated',
			access_token: signToken({
				user_id: user.id
			})
		});
	})
);

users.post('/changePassword',
	validate({
		body: validate.notEmpty({
			email: userFields.email,
			passwordRestoreToken: userFields.passwordRestoreToken,
			password: userFields.password
		}, ['email', 'passwordRestoreToken', 'password'])
	}),
	wrap(async function (req, res) {
		const [updated] = await User.update({
			active: true,
			passwordRestoreToken: null,
			hash: await User.hashPassword(req.body.password)
		}, {
			where: {
				email: req.body.email,
				passwordRestoreToken: req.body.passwordRestoreToken
			}
		});

		if (updated) {
			res.status(200).json({
				status: 'updated'
			});
		} else {
			throw new HttpError(400, 'invalid_password_restore_token');
		}
	})
);

users.post('/signin',
	validate({
		body: validate.notEmpty({
			login: userFields.login,
			password: userFields.password
		}, ['login', 'password'])
	}),
	wrap(async function (req, res) {
		const user = await User.findByLogin(req.body.login);

		if (user && await user.verifyPassword(req.body.password)) {
			if (!user.active) {
				throw new HttpError(404, 'user_not_active', {
					message: "Account is not activated, please check your inbox"
				});
			}

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

function storeAuthInfo(req, res, next) {
	if (req.query.accessToken) {
		req.session.accessToken = req.query.accessToken;
	}

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
	storeAuthInfo,
	passport.authenticate('facebook', {
		session: false,
		scope: 'email'
	})
);
users.get('/signin/facebook/callback',
	passportCallbackHandler('facebook'),
	redirectUser
);

// Twitter
users.get('/signin/twitter',
	storeAuthInfo,
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
	storeAuthInfo,
	passport.authenticate('google', {
		scope: 'profile email',
		session: false
	})
);
users.get('/signin/google/callback',
	passportCallbackHandler('google'),
	redirectUser
);

users.get('/me',
	authorizedOnly,
	wrap(async function (req, res) {
		res.status(200).json({
			user: req.user
		});
	})
);

users.post('/me',
	authorizedOnly,
	validate({
		body: validate
			.only(inputUserSchema, ['password', 'username', 'paypalReceiver'])
			.optional(['password', 'username', 'paypalReceiver'])
	}),
	wrap(async function (req, res) {
		req.user.set(
			_.pick(req.body, ['username'])
		);

		if (req.get('password')) {
			req.passwordVerified = await req.user.verifyPassword(req.get('password'));
		} else {
			req.passwordVerified = false;
		}

		if (req.body.password) {
			if (req.passwordVerified) {
				await req.user.setPassword(req.body.password);
			} else {
				throw new HttpError(403, 'access_denied');
			}
		}

		if (req.body.paypalReceiver) {
			if (req.passwordVerified) {
				req.user.paypalReceiver = req.body.paypalReceiver;
			} else {
				throw new HttpError(403, 'access_denied');
			}
		}

		await req.user.save().catch(catchUserConstraintErrors);

		res.status(200).json({
			user: req.user
		});
	})
);

export default users;
