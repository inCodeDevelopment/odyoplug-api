import Sequelize from 'sequelize';
import dbConnection from 'dbConnection';
import initializer from './initializer';

export const Transaction = dbConnection.define('transaction', {
	tx: {
		type: Sequelize.STRING,
		defaultValue: () => Sequelize.literal(`'ODY-' || nextval('transactions_tx_seq')`)
	},
	type: {
		type: Sequelize.ENUM('beats_purchase', 'beats_sell', 'tax', 'subscription'),
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
	},
	paypalId: {
		type: Sequelize.STRING
	},
	paypalBuyer: {
		type: Sequelize.STRING
	},
	paypalSeller: {
		type: Sequelize.STRING
	},
	itemNames: {
		type: Sequelize.STRING
	},
	details: {
		type: Sequelize.HSTORE
	}
});

Transaction.addScope('skip:superTransactions', {
	where: {
		superTransactionId: {
			$ne: null
		}
	}
});
initializer.did('Transaction scope skip:superTransactions');

initializer.after(['models'], function ({User, TransactionItem}) {
	Transaction.hasMany(Transaction, {
		as: 'subTransactions',
		foreignKey: 'superTransactionId'
	});

	Transaction.belongsTo(Transaction, {
		as: 'superTransaction',
		foreignKey: 'superTransactionId'
	});

	Transaction.belongsTo(User);

	Transaction.hasMany(TransactionItem, {
		as: 'items'
	});
});

initializer.after(['models', 'TransactionItem scope with:beat'], function ({TransactionItem}) {
	Transaction.addScope('with:items', {
		include: [
			{
				model: TransactionItem.scope('with:beat'),
				as: 'items'
			}
		]
	});
	initializer.did('Transaction scope with:items');
});

initializer.after(['models', 'Transaction scope with:items'], function () {
	Transaction.addScope('with:subTransactions', {
		include: [
			{
				model: Transaction.scope('with:items'),
				as: 'subTransactions'
			}
		]
	});
	initializer.did('Transaction scope with:subTransactions');
});