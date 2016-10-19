import Sequelize from 'sequelize';
import dbConnection from 'dbConnection';

export const Transaction = dbConnection.define('transaction', {
	tx: {
		type: Sequelize.STRING
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
	},
	paypalId: {
		type: Sequelize.STRING
	},
	paypalBuyer: {
		type: Sequelize.STRING
	},
	paypalSeller: {
		type: Sequelize.STRING
	}
}, {
	defaultScope: {
		where: {
			superTransactionId: null
		}
	}
});

export function postLoad({User, TransactionItem, Beat, BeatFile}) {
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
}

