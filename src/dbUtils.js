import db from 'db';

import createFixtures from 'fixtures';

export async function createExtensions() {
	await db.query(`
		CREATE EXTENSION IF NOT EXISTS citext;
	`);

	await db.query(`
		CREATE EXTENSION IF NOT EXISTS pg_trgm;
	`);
}

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

	await db.query(`
		CREATE SEQUENCE public.transactions_tx_seq
			INCREMENT 1
			MINVALUE 1
			MAXVALUE 9223372036854775807
			START 1
			CACHE 1
			OWNED BY transactions.id;
	`);
}

export async function clear() {
	await createExtensions();

	await db.sync({
		match: /test$/,
		force: true
	});

	await createSequences();
	await createFixtures();
}
