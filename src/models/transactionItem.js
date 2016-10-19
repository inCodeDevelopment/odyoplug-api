import Sequelize from 'sequelize';
import dbConnection from 'dbConnection';
import initializer from './initializer';

export const TransactionItem = dbConnection.define('transactionItem', {
	price: {
		type: Sequelize.FLOAT
	},
	type: {
		type: Sequelize.ENUM('beat')
	}
});

initializer.after(['models'], function ({Transaction, Beat}) {
	TransactionItem.belongsTo(Transaction, {
		as: 'transaction'
	});

	TransactionItem.belongsTo(Beat);
});

initializer.after(['models', 'Beat scope with:file'], function ({Beat}) {
	TransactionItem.addScope('with:beat', {
		include: [{
			model: Beat.scope('with:file')
		}]
	});
	initializer.did('TransactionItem scope with:beat');
});