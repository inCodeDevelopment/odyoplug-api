import Sequelize from 'sequelize';
import dbConnection from 'dbConnection';

export const BeatFile = dbConnection.define('beatFile', {
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