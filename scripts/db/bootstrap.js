import db from 'db';
import createFixtures from 'fixtures';

db.sync()
	.then(() =>
		db.query(`
			CREATE SEQUENCE public.users_social_id_seq
				INCREMENT 1
				MINVALUE 1
				MAXVALUE 9223372036854775807
				START 1
				CACHE 1
				OWNED BY users.username;
		`)
	)
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
