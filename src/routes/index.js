import { Router } from 'express';

import users from './users';
import genres from './genres';
import beats from './beats';
import cart from './cart';
import ipn from './ipn';
import transactions from './transactions';

const router = Router();

router.use('/users', users);
router.use('/genres', genres);
router.use('/beats', beats);
router.use('/cart', cart);
router.use('/ipn', ipn);
router.use('/transactions', transactions);

export default router;
