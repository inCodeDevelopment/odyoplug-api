import { Router } from 'express';
import config from 'config';
import { verify as verifyIpn } from 'paypal-ipn';

import db, { User, Transaction, Beat, CartItem } from 'db';

import { wrap } from './utils';
import _ from 'lodash';
import uuid from 'node-uuid';

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
		await db.transaction(async tx => {
			const custom = JSON.parse(req.body.custom);

			const transaction = await Transaction.findById(custom.transactionId, {
				transaction: tx
			});
			if (!transaction) {
				res.status(500).send();
				return;
			}

			const user = await User.findById(custom.user, {
				transaction: tx
			});
			if (!user) {
				res.status(500).send();
				return;
			}

			if (['Failed', 'Denined'].includes(req.body.payment_status)) {
				await transaction.update({
					status: 'fail'
				}, {
					transaction: tx
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
	      }, {
					transaction: tx
				});
	      res.status(500).send();
	      return;
	    }

			const beats = await transaction.getBeats({
				transaction: tx
			});

	    // @TODO save relation between user and bought beat
	    await CartItem.destroy({
	      where: {
	        userId: custom.user,
	        beatId: {
	          $in: beats.map(_.property('id'))
	        }
	      },
				transaction: tx
	    });

	    await transaction.update({
	      status: 'success'
	    }, {
				transaction: tx
			});

			const beatsByUser = _.groupBy(beats, 'userId');

			for (const userId of Object.keys(beatsByUser)) {
				const sum = _.sumBy(beatsByUser[userId], 'price');

				await User.update({
					balance: db.literal(`balance + ${sum}`)
				}, {
					where: {
						id: userId
					},
					transaction: tx
				})
				const sellerTransaction = await Transaction.create({
					id: uuid.v4(),
					type: 'beats_sell',
					amount: sum,
					status: 'success',
					userId: userId
				}, {
					transaction: tx
				});

				await sellerTransaction.setBeats(_.map(beats, 'id'), {
					transaction: tx
				});
			}

	    res.status(200).send()
		});
  })
);

export default ipn;
