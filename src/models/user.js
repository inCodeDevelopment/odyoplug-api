import Sequelize from 'sequelize';
import dbConnection from 'dbConnection';
import bcrypt from 'bcrypt-as-promised';
import initializer from './initializer';

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