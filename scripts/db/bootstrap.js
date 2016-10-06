import db from 'db';
import createFixtures from 'fixtures';
import { createSequences } from 'dbUtils';

db.sync()
	.then(() => createSequences())
	.then(() => createFixtures())
	.then(() => {
		console.log('DB bootstraped');
	})
	.catch(err => {
		console.log('Error while bootstraping db', err);
	})
	.finally(() => {
		process.exit(0);
	});
