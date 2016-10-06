import db from 'db';
import createFixtures from 'fixtures';

export async function clear() {
	await db.sync({
		match: /test$/,
		force: true
	});

	await createFixtures();
}
