import { Router } from 'express';
import sequelize from 'sequelize';
import { validate, authorizedOnly } from 'middlewares';
import uuid from 'node-uuid';
import {wrap} from './utils';
import { CartItem, Beat, BeatFile, Transaction, User } from 'db';
import _ from 'lodash';
import url from 'url';
import config from 'config';
import paypal from 'paypal';

const cart = Router();

const returnCart = wrap(async function (req, res) {
  const beats = await CartItem.scope('with:beats').findAll({
    where: req.cart
  }).map(_.property('beat'));

  res.status(200).json({
    cart: {
      beats
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
    if (['ipn', 'status', 'callback'].includes(req.params.id)) {
      return next();
    }

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
  wrap(async function(req, res) {
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

cart.post('/my/transaction',
  wrap(async function (req, res) {
    const beats = await CartItem
      .findAll({
        where: req.cart,
        include: [{
          model: Beat,
          include: [
            { model: User },
            { model: BeatFile, as: 'file' }
          ]
        }]
      })
      .map(_.property('beat'));

    const transaction = await Transaction.create({
      id: sequelize.literal(`'ODY-' || nextval('transactions_id_seq')`),
      type: 'beats_purchase',
      amount: _.sumBy(beats, 'price'),
      status: 'wait'
    });

    for (const beat of beats) {
      await transaction.createItem({
        price: beat.price,
        type: 'beat',
        beatId: beat.id
      });
    }

    function tax(price) {
      return Math.ceil(price * 0.1 * 100) / 100;
    }

    const taxAmount = _.sumBy(beats, beat => tax(beat.price));
    const payments = [
      {
        currency: 'USD',
        action: 'Sale',
        description: 'ODYOPLUG TAX',
        receiver: config.get('paypal.receiver'),
        id: `${transaction.id}-TAX`,
        items: [{
          id: 'ODYOPLUG-TAX',
          amount: taxAmount
        }]
      }
    ];

    const beatsByUser = _.groupBy(beats, 'userId');
    for (const userId of Object.keys(beatsByUser)) {
      payments.push({
        currency: 'USD',
        action: 'Sale',
        description: beatsByUser[userId][0].user.name,
        receiver: beatsByUser[userId][0].user.paypalReceiver,
        id: `${transaction.id}-${userId}`,
        items: beatsByUser[userId].map(
          beat => ({
            name: beat.name,
            id: `BEAT-${beat.id}`,
            amount: Math.floor((beat.price - tax(beat.price))*100) / 100
          })
        )
      });
    }

    const baseURL = req.get('Referer') || config.baseUrl;

    const expressCheckout = await paypal.setExpressCheckout({
      returnURL: url.resolve(baseURL, '/placeholder/ask_me_to_change_it/i_will_do_it_as_soon_as_possible'),
      cancelURL: url.resolve(baseURL, '/placeholder/ask_me_to_change_it/i_will_do_it_as_soon_as_possible'),
      payments: payments
    });

    res.status(200).json({
      url: paypal.checkoutURL(expressCheckout.TOKEN)
    });
  })
);

export default cart;
