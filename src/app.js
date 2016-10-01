import express from 'express';
import bodyParser from 'body-parser';
import routes from 'routes';
import { authorization, errorHandler } from 'middlewares';
import { ready as dbReady } from 'db';

const app = express();

app.use(bodyParser.json());
app.use(authorization);

app.use('/api', routes);

app.use(errorHandler);

app.ready = dbReady;
app.resolveWhenReady = () => app.ready;

export default app;