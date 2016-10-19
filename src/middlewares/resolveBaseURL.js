import url from 'url';
import config from 'config';

export default function (req, res, next) {
	if (config.resolveBaseURLFromReferrer) {
		req.baseURL = req.get('Referrer') || config.baseURL;
	} else {
		req.baseURL = config.baseURL;
	}

	req.resolveFromBaseURL = function (path) {
		return url.resolve(req.baseURL, path);
	};

	next()
}
