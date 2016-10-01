import passport from 'passport';
import { OAuth2Strategy as GoogleStrategy } from 'passport-google-oauth'
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { Strategy as TwitterStrategy } from 'passport-twitter';
import config from 'config';
import { sign as signToken } from 'token';
import { User } from 'db';

function verifyUser(req, accessToken, refreshToken, profile, done) {
	User.findOne({
		where: {
			[profile.provider+'Id']: profile.id
		}
	}).then(user => {
		if (user) {
			return {
				access_token: signToken({
					user_id: user.id
				})
			};
		} else {
			return {
				auth_code: signToken({
					social_id: profile.id,
					path: profile.provider+'Id'
				})
			};
		}
	}).asCallback(done);
}

export default function() {
	passport.use(new FacebookStrategy({
		clientID: config.get('socialAuth.facebook.clientId'),
		clientSecret: config.get('socialAuth.facebook.clientSecret'),
		callbackURL: config.get('baseUrl') + `/api/users/signin/facebook/callback`,
		passReqToCallback: true
	}, verifyUser));

	passport.use(new TwitterStrategy({
		consumerKey: config.get('socialAuth.twitter.consumerKey'),
		consumerSecret: config.get('socialAuth.twitter.consumerSecret'),
		callbackURL: config.get('baseUrl') + '/api/users/signin/twitter/callback',
		passReqToCallback: true
	}, verifyUser))

	passport.use(new GoogleStrategy({
		clientID: config.get('socialAuth.google.clientId'),
		clientSecret: config.get('socialAuth.google.clientSecret'),
		callbackURL: config.get('baseUrl') + `/api/users/signin/google/callback`,
		passReqToCallback: true
	}, verifyUser));
}
