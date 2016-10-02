import express from 'express';
import bodyParser from 'body-parser';
import routes from 'routes';
import { authorization, errorHandler } from 'middlewares';
import expressValidator from 'express-validator';
import { ready as dbReady } from 'db';
import initPassportStrategies from 'passportStrategies';

initPassportStrategies();

const app = express();

app.use(bodyParser.json());
app.use(expressValidator());

app.use(authorization);

app.use('/api', routes);

app.use(errorHandler);

app.ready = dbReady;
app.resolveWhenReady = () => app.ready;

export default app;