import db from 'db';
import createFixtures from 'fixtures';
import { createSequences, createExtensions } from 'dbUtils';

createExtensions()
	.then(() => db.sync({force: true}))
	.then(createSequences)
	.then(createFixtures)
	.then(() => {
		console.log('DB reset done');
	})
	.catch(err => {
		console.log('Error while resetting db', err);
	})
	.finally(() => {
		process.exit(0);
	});
