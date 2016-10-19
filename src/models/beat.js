import Sequelize from 'sequelize';
import dbConnection from 'dbConnection';

export const Beat = dbConnection.define('beat', {
	name: {
		type: Sequelize.STRING,
		allowNull: false
	},
	tempo: {
		type: Sequelize.INTEGER,
		allowNull: false
	},
	price: {
		type: Sequelize.FLOAT,
		allowNull: false
	},
	fileId: {
		type: Sequelize.INTEGER,
		unique: true
	}
}, {
	timestamps: true,
	indexes: [
		{
			method: 'GIST',
			fields: ['name'],
			operator: 'gist_trgm_ops'
		}
	]
});

export function postLoad({Genre, User, BeatFile}) {
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

	Beat.addScope('orderBy:createdAt_desc', {
		order: [
			['createdAt', 'DESC']
		]
	});
}