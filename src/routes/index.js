import { Router } from 'express';

import users from './users';
import genres from './genres';
import beats from './beats';
import cart from './cart';

const router = Router();

router.use('/users', users);
router.use('/genres', genres);
router.use('/beats', beats);
router.use('/cart', cart);

export default router;
