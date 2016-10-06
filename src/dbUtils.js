import db from 'db';
import createFixtures from 'fixtures';

export async function createSequences() {
	await db.query(`
		CREATE SEQUENCE public.users_social_id_seq
			INCREMENT 1
			MINVALUE 1
			MAXVALUE 9223372036854775807
			START 1
			CACHE 1
			OWNED BY users.username;
	`);
}

export async function clear() {
	await db.sync({
		match: /test$/,
		force: true
	});

	await createSequences();
	await createFixtures();
}
