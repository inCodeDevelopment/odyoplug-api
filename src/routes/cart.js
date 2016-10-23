import {Router} from 'express';
import sequelize from 'sequelize';
import {validate, authorizedOnly} from 'middlewares';
import uuid from 'node-uuid';
import {wrap} from './utils';
import {CartItem, Beat, User} from 'db';
import _ from 'lodash';
import {HttpError} from 'HttpError';

const cart = Router();

const returnCart = wrap(async function (req, res) {
	const cartItems = await CartItem.scope('with:beats').findAll({
		where: req.cart
	});

	res.status(200).json({
		cart: {
			cartItems
		}
	});
});

cart.post('/guest', function (req, res) {
	res.status(200).json({
		cartId: uuid.v4()
	})
});

cart.use('/:id',
	(req, res, next) => {
		if (req.params.id !== 'my') {
			validate({
				params: {
					id: {
						isUUID: {
							options: [4]
						},
						errorMessage: 'Invalid cart id'
					}
				}
			})(req, res, next);
		} else {
			authorizedOnly(req, res, next)
		}
	},
	function (req, res, next) {
		if (req.params.id === 'my') {
			req.cart = {
				userId: req.user_id
			};
		} else {
			req.cart = {
				cartId: req.params.id
			};
		}

		next();
	}
);

cart.get('/:id', returnCart);

cart.post('/my/import',
	validate({
		body: {
			cartId: {
				errorMessage: 'Invalid cartId'
			}
		}
	}),
	wrap(async function (req, res) {
		const itemsToImport = await CartItem.findAll({
			where: {
				cartId: req.body.cartId
			}
		});

		for (const item of itemsToImport) {
			try {
				await item.update({
					cartId: null,
					userId: req.user_id
				});
			} catch (err) {
				if (err instanceof sequelize.UniqueConstraintError) {
					await item.destroy();
				} else {
					throw err;
				}
			}
		}
	}),
	returnCart
);

cart.post('/:id/addBeat',
	validate({
		body: {
			beatId: {
				errorMessage: 'Invalid beatId'
			}
		}
	}),
	wrap(async function (req, res) {
		const beat = await Beat.findById(req.body.beatId, {
			include: [{model: User}]
		});

		if (!beat.user.paypalReceiver && !beat.user.email) {
			throw new HttpError(422, 'invalid_paypal_receiver', {
				errorMessage: 'Since producer has not provided proper paypal receiver email, you can\' purchase this beat'
			});
		}

		try {
			const cartItem = await CartItem.create({
				...req.cart,
				beatId: req.body.beatId
			});
		} catch (err) {
			if (err instanceof sequelize.UniqueConstraintError) {
				return;
			} else {
				throw err;
			}
		}
	}),
	returnCart
);

cart.post('/:id/removeBeat',
	validate({
		body: {
			beatId: {
				errorMessage: 'Invalid beatId'
			}
		}
	}),
	wrap(async function (req, res) {
		await CartItem.destroy({
			where: {
				...req.cart,
				beatId: req.body.beatId
			}
		});
	}),
	returnCart
);

cart.post('/:id/clear',
	validate({
		body: {
			beatId: {
				errorMessage: 'Invalid beatId'
			}
		}
	}),
	wrap(async function (req, res) {
		await CartItem.destroy({
			where: req.cart
		});
	}),
	returnCart
);

export default cart;
