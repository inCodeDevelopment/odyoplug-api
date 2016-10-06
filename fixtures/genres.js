import genres from './genres.json';

import { Genre, ready } from 'db';

export default async function() {
  await ready;

  await Genre.bulkCreate(
    genres.map(name => ({name}))
  );
}
