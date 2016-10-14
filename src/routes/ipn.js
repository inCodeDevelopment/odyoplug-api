import { Router } from 'express';
import config from 'config';
import { verify as verifyIpn } from 'paypal-ipn';

import { User, Transaction, Beat } from 'db';

import { wrap } from './utils';

const ipn = Router();

ipn.use(
	(req, res, next) => {
		verifyIpn(req.body, {
			allow_sandbox: config.get('paypal.mode') === 'sandbox'
		}, next);
	}
)

ipn.post('/beatPurchase',
  wrap(async function(req, res) {
    if (req.body.payment_status !== 'Completed') {
      res.status(200).send();
      return;
    }

    const custom = JSON.parse(req.body.custom);

    if (!custom.transactionId) {
      res.status(500).send();
      return;
    }

    const user = await User.findById(custom.user);

    if (!user) {
      await Transaction.create({
        id: custom.transactionId,
        status: 'fail'
      });
      res.status(500).send();
      return;
    }

    // if this transaction handled already
    if (await Transaction.findById(custom.transactionId)) {
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
        id: custom.transactionId,
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
      id: custom.transactionId,
      status: 'success'
    });

    res.status(200).send()
  })
);

export default ipn;
