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
import sequelize from 'sequelize';
import uuid from 'node-uuid';
import mailer from 'mailer';

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

async function catchUniqueConstraintError(error) {
		if (
			error instanceof sequelize.UniqueConstraintError &&
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
			error instanceof sequelize.UniqueConstraintError &&
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
			username: req.body.username,
			active: false,
			activationToken: uuid.v4()
		});

		await user.setPassword(req.body.password);
		await user.save().catch(catchUniqueConstraintError);

		const baseUrl = req.get('Referrer') || config.get('baseUrl');
		await mailer.send('user-activation', req.body.email, {
			url: url.resolve(baseUrl, '/auth/registration/activate'),
			activationToken: user.activationToken,
			email: user.email,
			username: user.username
		});

		res.status(201).json({user});
	})
);

users.post('/requestActivationEmail',
	validate({
		body: {
			login: {
				notEmpty: true,
				errorMessage: 'Invalid login'
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

		if (!user) {
			throw new HttpError(400, 'invalid_input', {
				errors: {
					login: {
						param: 'login',
						msg: 'User not found',
						value: req.body.login
					}
				}
			});
		}

		const activationToken = uuid.v4();

		await user.update({
			activationToken: activationToken
		});

		const baseUrl = req.get('Referrer') || config.get('baseUrl');
		await mailer.send('user-activation', user.email, {
			url: url.resolve(baseUrl, '/auth/registration/activate'),
			activationToken: activationToken,
			email: user.email,
			username: user.username
		});

		res.status(200).json({status: 'sent'});
	})
);

users.post('/requestPasswordRestoreEmail',
	validate({
		body: {
			login: {
				notEmpty: true,
				errorMessage: 'Invalid login'
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

		if (!user) {
			throw new HttpError(400, 'invalid_input', {
				errors: {
					login: {
						param: 'login',
						msg: 'User not found',
						value: req.body.login
					}
				}
			});
		}

		const passwordRestoreToken = uuid.v4();
		await user.update({
			passwordRestoreToken: passwordRestoreToken
		});

		const baseUrl = req.get('Referrer') || config.get('baseUrl');
		await mailer.send('restore-password', user.email, {n
			url: url.resolve(baseUrl, '/auth/forgot/password'),
			passwordRestoreToken: passwordRestoreToken,
			email: user.email,
			username: user.username
		});

		res.status(200).json({status: 'sent'});
	})
);

users.post('/activate',
	validate({
		body: {
			email: {
				...schemas.email,
				notEmpty: true
			},
			activationToken: {
				errorMessage: 'Invalid activation token',
				notEmpty: true
			}
		}
	}),
	wrap(async function(req, res) {
		const user = await User.findOne({
			where: {
				email: req.body.email,
				activationToken: req.body.activationToken
			}
		});

		if (user) {
			await user.update({
				active: true,
				activationToken: null
			})

			res.status(200).json({
				status: 'activated',
				access_token: signToken({
					user_id: user.id
				})
			});
		} else {
			throw new HttpError(400, 'invalid_activation_token');
		}
	})
);

users.post('/changePassword',
	validate({
		body: {
			email: {
				...schemas.email,
				notEmpty: true
			},
			passwordRestoreToken: {
				errorMessage: 'Invalid password restore token',
				notEmpty: true
			},
			password: {
				...schemas.password,
				notEmpty: true
			}
		}
	}),
	wrap(async function(req, res) {
		const [updated] = await User.update({
			active: true,
			passwordRestoreToken: null,
			hash: await User.hashPassword(req.body.password)
		},{
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

		await req.user.save().catch(catchUniqueConstraintError);

		res.status(200).json({
			user: req.user
		});
	})
);

export default users;
