import Sequelize from 'sequelize';
import dbConnection from 'dbConnection';

export const CartItem = dbConnection.define('cartItem', {
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

export function postLoad({Beat, BeatFile, User}) {
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
}