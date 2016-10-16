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
				? { username: login }
				: { email: login };

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
			delete values.passwordChangeToken;

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
		type: Sequelize.FLOAT,
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
	},
	fileId: {
		type: Sequelize.INTEGER,
		unique: true
	}
}, {
	timestamps: true,
	indexes: [
		{
			method: 'GIST',
			fields: ['name'],
			operator: 'gist_trgm_ops'
		}
	]
});

Beat.belongsTo(Genre);

Beat.belongsTo(User, {
	onDelete: 'CASCADE'
});
User.hasMany(Beat, {
	onDelete: 'CASCADE'
});
Beat.belongsTo(BeatFile, {
	as: 'file'
});
Beat.addScope('with:file', {
	include: [
		{
			model: BeatFile,
			as: 'file'
		}
	]
});

export const CartItem = db.define('cartItem', {
	cartId: {
		type: Sequelize.STRING,
		allowNull: true
	}
}, {
	indexes: [
		{
			fields: ['userId', 'beatId'],
			unique: true,
			where: {
				cartId: null
			}
		},
		{
			fields: ['cartId', 'beatId'],
			unique: true,
			where: {
				userId: null
			}
		}
	]
});

CartItem.belongsTo(Beat, {
	onDelete: 'CASCADE'
});
CartItem.belongsTo(User, {
	onDelete: 'CASCADE'
});

CartItem.addScope('with:beats', {
	include: [
		{
			model: Beat,
			include: [
				{
					model: BeatFile,
					as: 'file'
				}
			]
		}
	]
});

export const Transaction = db.define('transaction', {
	id: {
		type: Sequelize.STRING,
		primaryKey: true
	},
	type: {
		type: Sequelize.ENUM('beats_purchase', 'beats_sell', 'tax'),
		allowNull: false
	},
	amount: {
		type: Sequelize.FLOAT,
		allowNull: false
	},
	status: {
		type: Sequelize.ENUM('wait', 'success', 'fail', 'vary'),
		allowNull: false
	},
	paypalECToken: {
		type: Sequelize.STRING
	}
}, {
	defaultScope: {
		where: {
			superTransactionId: null
		}
	}
});

Transaction.hasMany(Transaction, {
	as: 'subTransactions',
	foreignKey: 'superTransactionId'
});
Transaction.belongsTo(Transaction, {
	as: 'superTransaction',
	foreignKey: 'superTransactionId'
});

Transaction.belongsTo(User);

export const TransactionItem = db.define('transactionItem', {
	price: {
		type: Sequelize.FLOAT
	},
	type: {
		type: Sequelize.ENUM('beat')
	}
});
TransactionItem.belongsTo(Transaction, {
	as: 'transaction'
});
Transaction.hasMany(TransactionItem, {
	as: 'items'
});
TransactionItem.belongsTo(Beat);

Transaction.addScope('with:items', {
	include: [
		{
			model: TransactionItem,
			as: 'items',
			include: [{
				model: Beat,
				include: [
					{
						model: BeatFile,
						as: 'file'
					}
				]
			}]
		}
	]
});

Transaction.addScope('with:subTransactions', {
	include: [
		{
			model: Transaction.scope('with:items'),
			as: 'subTransactions'
		}
	]
});

export const ready = db.authenticate();
