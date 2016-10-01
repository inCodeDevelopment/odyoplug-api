import request from 'request-promise';
import qs from 'querystring';

function oauth2(options) {
	return {
		authUrl({callbackUrl, state}) {
			return this.authUrlBase	+ '?' + qs.stringify({
				response_type: 'code',
				client_id: this.clientId,
				redirect_uri: callbackUrl,
				state: state,
				scope: this.scope
			});
		},

		async getAccessToken(code, redirectUri) {
			const res = await request({
				method: 'POST',
				uri: this.accessTokenUrl,
				form: {
					code,
					client_id: this.clientId,
					client_secret: this.clientSecret,
					redirect_uri: redirectUri,
					grant_type: 'authorization_code'
				},
				json: true
			});

			return res.access_token;
		},

		getSocialId() {
			return null;
		},
		...options
	};
}

export default oauth2;