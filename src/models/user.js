import Sequelize from 'sequelize';
import dbConnection from 'dbConnection';
import bcrypt from 'bcrypt-as-promised';
import initializer from './initializer';
import uuid from 'node-uuid';

export const User = dbConnection.define('user', {
	email: {
		type: 'citext',
		unique: true,
		allowNull: true
	},
	username: {
		type: 'citext',
		unique: true,
		allowNull: false
	},
	hash: Sequelize.STRING,
	googleId: {
		type: Sequelize.STRING,
		unique: true,
		allowNull: true
	},
	facebookId: {
		type: Sequelize.STRING,
		unique: true,
		allowNull: true
	},
	twitterId: {
		type: Sequelize.STRING,
		unique: true,
		allowNull: true
	},
	active: {
		type: Sequelize.BOOLEAN,
		defaultValue: true
	},
	activationToken: {
		type: Sequelize.STRING
	},
	passwordRestoreToken: {
		type: Sequelize.STRING
	},
	paypalReceiver: {
		type: Sequelize.STRING
	}
}, {
	timestamps: false,
	classMethods: {
		hashPassword(password) {
			return bcrypt.hash(password, 8)
		},
		findByLogin(login) {
			const query = login.indexOf('@') === -1
				? {username: login}
				: {email: login};

			return this.findOne({
				where: query
			});
		},
		async findByLoginPassword(login, password) {
			const user = await this.findByLogin(login);

			if (user && await user.verifyPassword(password)) {
				return user;
			} else {
				return null;
			}
		},
		async buildFromEmailUsernamePassword(email, username, password) {
			const user = this.build({
				email: email,
				username: username,
				active: false,
				activationToken: uuid.v4()
			});

			await user.setPassword(password);

			return user;
		},
		async activateByEmailToken(email, activationToken) {
			const user = await this.findOne({
				where: {email, activationToken}
			});

			if (!user) {
				return null;
			}

			await user.update({
				active: true,
				activationToken: null
			});

			return user;
		},
		async updatePasswordByEmailToken(password, email, passwordRestoreToken) {
			const [updated] = await this.update({
					active: true,
					passwordRestoreToken: null,
					hash: await bcrypt.hash(password, 8)
				},
				{
					where: {
						email: email,
						passwordRestoreToken: passwordRestoreToken
					}
				});

			return updated > 0;
		}
	},
	instanceMethods: {
		async setPassword(password) {
			this.set('hash', await bcrypt.hash(password, 8));
		},
		async verifyPassword(password) {
			try {
				await bcrypt.compare(password, this.hash);
				return true;
			} catch (err) {
				if (err instanceof bcrypt.MISMATCH_ERROR) {
					return false
				}
				throw err;
			}
		},
		resetActivationToken() {
			this.activationToken = uuid.v4();
			return this.save();
		},
		resetPasswordRestoreToken() {
			this.passwordRestoreToken = uuid.v4();
			return this.save();
		},
		toJSON() {
			const values = this.get({plain: true});

			// Delete private info
			delete values.hash;
			delete values.active;
			delete values.activationToken;
			delete values.passwordRestoreToken;
			delete values.passwordRestoreToken;

			return values;
		}
	}
});

initializer.after(['models'], function ({Beat}) {
	User.hasMany(Beat, {
		onDelete: 'CASCADE'
	});
});