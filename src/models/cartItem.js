import Sequelize from 'sequelize';
import dbConnection from 'dbConnection';
import initializer from './initializer';

export const CartItem = dbConnection.define('cartItem', {
	cartId: {
		type: Sequelize.STRING,
		allowNull: true
	},
	licenseId: {
		type: Sequelize.INTEGER,
		allowNull: false
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

initializer.after(['models'], function ({Beat, User}) {
	CartItem.belongsTo(Beat, {
		onDelete: 'CASCADE'
	});

	CartItem.belongsTo(User, {
		onDelete: 'CASCADE'
	});
});

initializer.after(['models', 'Beat scope with:file'], function ({Beat}) {
	CartItem.addScope('with:beats', {
		include: [
			{
				model: Beat.scope('with:file'),
				paranoid: true
			}
		]
	});
	initializer.did('CartItem scope with:beats');
});