import config from 'config';
import app from './app';
import winston from 'winston';

const port = config.get('port');
app.listen(port, () => {
	winston.info(`incode test api listening port ${port}`)
});
