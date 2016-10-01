import config from 'config'
import request from 'request-promise';
import oauth2 from './oauth2';

export default oauth2({
	authUrlBase: 'https://accounts.google.com/o/oauth2/v2/auth',
	accessTokenUrl: 'https://www.googleapis.com/oauth2/v4/token',
	clientId: config.get('socialAuth.google.clientId'),
	clientSecret: config.get('socialAuth.google.clientSecret'),
	scope: 'profile',
	async getSocialId(accessToken) {
		const res = await request({
			uri: 'https://www.googleapis.com/plus/v1/people/me',
			qs: {
				access_token: accessToken
			},
			json: true
		});
	}
});