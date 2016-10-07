import { Router } from 'express';

import users from './users';
import genres from './genres';
import beats from './beats';

const router = Router();

router.use('/users', users);
router.use('/genres', genres);
router.use('/beats', beats);

export default router;
