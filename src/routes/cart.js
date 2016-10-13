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

cart.get('/my/paypalBuyNowButton',
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
    for (let i=0; i<beats.length ; i++) {d
      items[`item_name_${i+1}`] = beat.name;
      items[`amount_${i+1}`] = beat.price;
      items[`item_number_${i+1}`] = beat.id;
    }

    const tx = uuid.v4();

    let custom = JSON.stringify({
      user: req.user_id,
      tx: tx
    });

    let baseUrl;
    if (config.get('socialAuth.resolveCallbackFromReferer')) {
      baseUrl = req.get('Referer')
    } else {
      baseUrl = config.get('baseUrl');
    }

    res.status(200).json({
      tx: tx,
      action: config.get('paypal.mode') === 'sandbox'
        ? 'https://www.sandbox.paypal.com/cgi-bin/webscr'
        : 'https://www.paypal.com/cgi-bin/webscr',
      data: {
        cmd: '_cart',
        upload: '1',
        business: config.get('paypal.receiver'),
        no_shipping: '1',
        return: url.resolve(config.get('baseUrl'), '/paypal_beats_callback'),
        notify_url: config.get('baseUrl') + '/api/cart/ipn',
        custom: custom,
        currency_code: 'USD',
        ...items
      }
    })
  })
);

cart.get('/my/status',
  wrap(async function(req, res) {
    const tx = await Transaction.findById(req.query.tx);
    if (!tx) {
      res.status(200).json({
        status: 'wait'
      });
    } else {
      res.status(200).json({
        status: tx.status
      });
    }
  })
);

cart.post('/ipn',
  (req, res, next) => {
    ipn.verify(req.body, {
      allow_sandbox: config.get('paypal.mode') === 'sandbox'
    }, next);
  },
  wrap(async function(req, res) {
	console.log(req.body)
    if (req.body.payment_status !== 'Completed') {
      res.status(200).send();
      return;
    }

    const custom = JSON.parse(req.body.custom);

    if (!custom.tx) {
      res.status(500).send();
      return;
    }

    const user = await User.findById(custom.user);

    if (!user) {
      await Transaction.create({
        id: custom.tx,
        status: 'fail'
      });
      res.status(500).send();
      return;
    }

    // if this transaction handled already
    if (await Transaction.findById(custom.tx)) {
      res.status(200).send();
      return;
    }

    let i=0;
    let beats = [];
    let amount;
    while (req.body[`item_number_${i+1}`]) {
      const beat = await Beat.findById(req.body[`item_number_${i+1}`]);
      beats.push(beat);
      amount += beat.price;
    }

    if (parseFloat(req.body.mc_gross) !== amount || req.body.mc_currency !== 'USD') {
      await Transaction.create({
        id: custom.tx,
        status: 'success'
      });
      res.status(500).send();
      return;
    }

    // @TODO save relation between user and bought beat
    await CartItem.destroy({
      where: {
        userId: custom.user,
        beatId: {
          $in: beats.map(_.property('id'))
        }
      }
    });

    await Transaction.create({
      id: custom.tx,
      status: 'success'
    });

    res.status(200).send()
  })
);

export default cart;
