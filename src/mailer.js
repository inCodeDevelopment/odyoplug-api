import mailgun from 'mailgun-js';
import config from 'config';
import fs from 'fs-promise';
import _ from 'lodash';
import DataLoader from 'dataloader';
import url from 'url';

const templateLoader = new DataLoader(templates =>
	Promise.map(templates, async templateName => ({
		subject: _.template(
			await fs.readFile(`./emailTemplates/${templateName}/subject`)
		),
		text: _.template(
			await fs.readFile(`./emailTemplates/${templateName}/template.text`)
		),
		html: _.template(
			await fs.readFile(`./emailTemplates/${templateName}/template.html`)
		)
	}))
);

let mailgunClient;
if (config.mailer.mailgun.apiKey) {
	mailgunClient = mailgun(config.mailer.mailgun);
}

async function send(templateName, to, data) {
	if (!mailgunClient) {
		return;
	}

	const template = await templateLoader.load(templateName);

	await mailgunClient.messages().send({
		from: config.mailer.from,
		to: to,
		subject: template.subject(data),
		text: template.text(data),
		html: template.html(data)
	});
}

function sendUserActivation(user, options) {
	return mailer.send('user-activation', user.email, {
		url: url.resolve(options.baseURL, '/auth/registration/activate'),
		activationToken: user.activationToken,
		email: user.email,
		username: user.username
	});
}

function sendRestorePassword(user, options) {
	return mailer.send('restore-password', user.email, {
		url: url.resolve(options.baseURL, '/auth/forgot/password'),
		passwordRestoreToken: user.passwordRestoreToken,
		email: user.email,
		username: user.username
	});
}

const mailer = {
	send,
	sendUserActivation,
	sendRestorePassword
};

export default mailer;
