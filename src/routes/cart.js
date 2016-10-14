import { Router } from 'express';
import sequelize from 'sequelize';
import { validate, authorizedOnly } from 'middlewares';
import uuid from 'node-uuid';
import {wrap} from './utils';
import { CartItem, Beat, BeatFile, Transaction, User } from 'db';
import _ from 'lodash';
import url from 'url';
import ipn from 'paypal-ipn';
import config from 'config';

const cart = Router();

const returnCart = wrap(async function (req, res) {
  const beats = await CartItem.findAll({
    where: req.cart,
    include: [
      {
        model: Beat,
        include: [
          {
            model: BeatFile,
            as: 'file'
          }
        ]
      }
    ]
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
    const beats = await CartItem.findAll({
      where: req.cart,
      include: [
        {
          model: Beat,
          include: [
            {
              model: BeatFile,
              as: 'file'
            }
          ]
        }
      ]
    }).map(_.property('beat'));

    const items = {};
    let amount = 0;
    for (let i=0; i<beats.length ; i++) {
      items[`item_name_${i+1}`] = beats[i].name;
      items[`amount_${i+1}`] = beats[i].price;
      items[`item_number_${i+1}`] = beats[i].id;
      amount += beats[i].price;
    }

    const transactionId = uuid.v4();

    let custom = JSON.stringify({
      user: req.user_id,
      transactionId: transactionId
    });

    const transaction = await Transaction.create({
      id: transactionId,
      type: 'beats_purchase',
      amount: amount,
      status: 'wait',
      userId: req.user_id
    });

    await transaction.setBeats(beats.map(_.property('id')));

    let baseUrl;
    if (config.get('socialAuth.resolveCallbackFromReferer')) {
      baseUrl = req.get('Referer')
    } else {
      baseUrl = config.get('baseUrl');
    }

    res.status(200).json({
      transactionId: transactionId,
      action: config.get('paypal.mode') === 'sandbox'
        ? 'https://www.sandbox.paypal.com/cgi-bin/webscr'
        : 'https://www.paypal.com/cgi-bin/webscr',
      data: {
        cmd: '_cart',
        upload: '1',
        business: config.get('paypal.receiver'),
        no_shipping: '1',
        return: url.resolve(config.get('baseUrl'), '/paypal_beats_callback'),
        notify_url: config.get('baseUrl') + '/api/ipn/beatsPurchase',
        custom: custom,
        currency_code: 'USD',
        ...items
      }
    })
  })
);

export default cart;
