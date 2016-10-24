import Sequelize from 'sequelize';
import config from 'config';
import _ from 'lodash';
import dbConnection from 'dbConnection';
import initializer from './initializer'

export const Beat = dbConnection.define('beat', {
	name: {
		type: Sequelize.STRING,
		allowNull: false
	},
	tempo: {
		type: Sequelize.INTEGER,
		allowNull: false
	},
	basePrice: {
		type: Sequelize.FLOAT,
		allowNull: true
	},
	prices: {
		type: Sequelize.HSTORE
	},
	fileId: {
		type: Sequelize.INTEGER,
		unique: true
	}
}, {
	timestamps: true,
	paranoid: true,
	indexes: [
		{
			method: 'GIST',
			fields: ['name'],
			operator: 'gist_trgm_ops'
		}
	],
	instanceMethods: {
		price(licenseId) {
			return parseFloat(this.prices[licenseId.toString()]);
		},
		tax(licenseId) {
			return _.ceil(this.price(licenseId) * config.tax, 2);
		},
		priceAfterTax(licenseId) {
			return _.ceil(this.price(licenseId) - this.tax(licenseId), 2);
		}
	}
});

initializer.after(['models'], function ({Genre, User, BeatFile, License}) {
	Beat.belongsTo(Genre);

	Beat.belongsTo(User, {
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
	initializer.did('Beat scope with:file');

	Beat.addScope('with:license', {
		include: [{
			model: License
		}]
	});
	initializer.did('Beat scope with:license');

	Beat.addScope('orderBy:createdAt_desc', {
		order: [
			['createdAt', 'DESC']
		]
	});
});