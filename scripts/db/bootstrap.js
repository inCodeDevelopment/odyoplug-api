import db from 'db';

db.sync()
	.then(() => {
		console.log('DB bootstraped');
	})
	.catch(err => {
		console.log('Error while bootstraping db', err);
	})
	.finally(() => {
		process.exit(0);
	});