import passport from 'passport';
import { OAuth2Strategy as GoogleStrategy } from 'passport-google-oauth'
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { Strategy as TwitterStrategy } from 'passport-twitter';
import config from 'config';
import { sign as signToken } from 'token';
import { User } from 'db';
import _ from 'lodash';
import sequelize from 'sequelize';
import latinize from 'latinize';

function verifyUser(req, accessToken, refreshToken, profile, done) {
	function returnAccessToken(user) {
		return {
			access_token: signToken({
				user_id: user.id
			})
		};
	}
	
	(async function() {
		const userBySocialId = await User.findOne({
			where: {
				[profile.provider+'Id']: profile.id
			}
		});

		if (userBySocialId) {
			return returnAccessToken(userBySocialId)
		}

		// @TODO check security threats
		if (profile.emails && profile.emails.length !== 0) {
			const userByEmail = await User.findOne({
				where: {
					email: {
						$in: _.map(profile.emails, 'value')
					}
				}
			});

			if (userByEmail) {
				return returnAccessToken(userByEmail)
			}
		}

		const username = profile.displayName
			? latinize(profile.displayName).replace(/[^a-zA-Z0-9._]+/g, '')
			: profile.provider;

		let email;
		if (profile.emails && profile.emails.length !== 0) {
			email = profile.emails[0].value;
		}

		while(true) {
			try {
				const user = await User.create({
					email: email,
					[profile.provider+'Id']: profile.id,
					username: sequelize.literal(`'${username}' || nextval('users_social_id_seq')`)
				});

				return returnAccessToken(user);
			} catch (error) {
				console.log(error)
				if (
					error.name !== 'SequelizeUniqueConstraintError' ||
					!_.some(error.errors, _.matches({
						type: 'unique violation',
						path: 'username'
					}))
				) {
					throw error;
				}
			}
		}
	})().asCallback(done);
}

export default function() {
	passport.use(new FacebookStrategy({
		clientID: config.get('socialAuth.facebook.clientId'),
		clientSecret: config.get('socialAuth.facebook.clientSecret'),
		callbackURL: config.get('baseUrl') + `/api/users/signin/facebook/callback`,
		passReqToCallback: true,
		profileFields: ['id', 'emails', 'name']
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
