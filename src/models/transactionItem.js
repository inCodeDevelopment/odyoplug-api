import Sequelize from 'sequelize';
import dbConnection from 'dbConnection';

export const TransactionItem = dbConnection.define('transactionItem', {
	price: {
		type: Sequelize.FLOAT
	},
	type: {
		type: Sequelize.ENUM('beat')
	}
});

export function postLoad({Transaction, Beat}) {
	TransactionItem.belongsTo(Transaction, {
		as: 'transaction'
	});

	TransactionItem.belongsTo(Beat);
}