import { Router } from 'express';

import users from './users';
import genres from './genres';

const router = Router();

router.use('/users', users);
router.use('/genres', genres);

export default router;
