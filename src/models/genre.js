import Sequelize from 'sequelize';
import dbConnection from 'dbConnection';

export const Genre = dbConnection.define('genre', {
	name: {
		type: Sequelize.STRING,
		allowNull: true
	}
}, {
	timestamps: false
});
