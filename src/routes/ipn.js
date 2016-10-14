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

ipn.post('/beatsPurchase',
  wrap(async function(req, res) {
		const custom = JSON.parse(req.body.custom);

		const transaction = await Transaction.findById(custom.transactionId);
		if (transaction) {
			res.status(500).send();
			return;
		}

		const user = await User.findById(custom.user);
		if (!user) {
			res.status(500).send();
			return;
		}

		if (['Failed', 'Denined'].includes(req.body.payment_status)) {
			await transaction.update({
				status: 'fail'
			});
			return;
		}

    if (req.body.payment_status !== 'Completed') {
      res.status(200).send();
      return;
    }

    if (parseFloat(req.body.mc_gross) !== transaction.amount || req.body.mc_currency !== 'USD') {
      await transaction.update({
        status: 'fail'
      });
      res.status(500).send();
      return;
    }

		const beats = await transaction.getBeats();

    // @TODO save relation between user and bought beat
		// @TODO create transaction for seller
    await CartItem.destroy({
      where: {
        userId: custom.user,
        beatId: {
          $in: beats.map(_.property('id'))
        }
      }
    });

    await transaction.update({
      id: custom.transactionId,
      status: 'success'
    });

    res.status(200).send()
  })
);

export default ipn;
