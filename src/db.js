import Sequelize from 'sequelize';
import bcrypt from 'bcrypt-as-promised';
import config from 'config';

const dbConf = config.get('db');

const db = new Sequelize(dbConf.name, dbConf.username, dbConf.password, {
	host: dbConf.host,
	dialect: 'postgres',
	logging: false,
	pool: {
		max: 5,
		min: 0,
		idle: 10000
	}
});

export default db;

export const User = db.define('user', {
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
	}
}, {
	timestamps: false,
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
			delete values.googleId;
			delete values.twitterId;
			delete values.facebookId;

			return values;
		}
	}
});

export const Genre = db.define('genre', {
	name: {
		type: Sequelize.STRING,
		allowNull: true
	}
}, {
	timestamps: false
});

export const BeatFile = db.define('beatFile', {
	url: {
		type: Sequelize.STRING,
		allowNull: false
	},
	duration: {
		type: Sequelize.INTEGER,
		allowNull: false
	}
}, {
	timestamps: false
});

export const Beat = db.define('beat', {
	name: {
		type: Sequelize.STRING,
		allowNull: false
	},
	tempo: {
		type: Sequelize.INTEGER,
		allowNull: false
	},
	price: {
		type: Sequelize.FLOAT,
		allowNull: false
	}
}, {
	timestamps: true
});

Beat.belongsTo(Genre);

Beat.belongsTo(User, {
	onDelete: 'CASCADE'
});
User.hasMany(Beat, {
	onDelete: 'CASCADE'
});

BeatFile.belongsTo(Beat, {
	as: 'beat',
	onDelete: 'CASCADE'
});
Beat.hasOne(BeatFile, {
	as: 'file',
	onDelete: 'CASCADE'
});

export const ready = db.authenticate();
