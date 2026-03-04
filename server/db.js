const knex = require('knex');
const path = require('path');

const db = knex({
    client: 'sqlite3',
    connection: {
        filename: process.env.DB_PATH || path.join(__dirname, 'database.sqlite')
    },
    useNullAsDefault: true
});

const initDb = async () => {
    const hasUsers = await db.schema.hasTable('users');
    if (!hasUsers) {
        await db.schema.createTable('users', (table) => {
            table.increments('id').primary();
            table.string('username').unique().notNullable();
            table.string('password').notNullable();
            table.timestamps(true, true);
        });
    }

    const hasSites = await db.schema.hasTable('sites');
    if (!hasSites) {
        await db.schema.createTable('sites', (table) => {
            table.increments('id').primary();
            table.integer('user_id').unsigned().references('id').inTable('users');
            table.string('name').notNullable();
            table.string('url').notNullable();
            table.boolean('requires_login').defaultTo(false);
            table.string('site_username');
            table.string('site_password');
            table.string('screenshot_path');
            table.string('status').defaultTo('Waiting');
            table.timestamps(true, true);
        });
    }
};

module.exports = { db, initDb };
