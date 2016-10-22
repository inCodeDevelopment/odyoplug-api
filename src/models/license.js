import Sequelize from 'sequelize';
import dbConnection from 'dbConnection';
import initializer from './initializer';

export const License = dbConnection.define('license', {
	name: {
		type: Sequelize.STRING,
		allowNull: false
	},
	mp3: {
		type: Sequelize.BOOLEAN,
		allowNull: false
	},
	wav: {
		type: Sequelize.BOOLEAN,
		allowNull: false
	},
	trackout: {
		type: Sequelize.BOOLEAN,
		allowNull: false
	},
	discounts: {
		type: Sequelize.BOOLEAN,
		allowNull: false
	},
	enabled: {
		type: Sequelize.BOOLEAN,
		allowNull: false
	},
	default: {
		type: Sequelize.BOOLEAN,
		allowNull: false
	}
}, {
	timestamps: true,
	paranoid: true
});

initializer.after(['models'], function ({User}) {
	License.belongsTo(User);
});