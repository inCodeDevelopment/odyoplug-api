import express from 'express';
import bodyParser from 'body-parser';
import routes from 'routes';
import uploads from 'uploads';
import { authorization, errorHandler } from 'middlewares';
import expressValidator from 'express-validator';
import { ready as dbReady } from 'db';
import initPassportStrategies from 'passportStrategies';
import cors from 'cors';
import config from 'config';

initPassportStrategies();

const app = express();

var whitelist = config.get('corsWhitelist');

app.use(
  cors({
    origin: whitelist,
    credentials: true
  })
);
app.use(bodyParser.json());
app.use(expressValidator());

app.use(authorization);

app.use('/api', routes);
app.use('/uploads', uploads);

app.use(errorHandler);

app.ready = dbReady;
app.resolveWhenReady = () => app.ready;

export default app;
