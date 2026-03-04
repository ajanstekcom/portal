const knex = require('knex');
const path = require('path');
const fs = require('fs');

const db = knex({
    client: 'sqlite3',
    connection: {
        filename: process.env.DB_PATH || path.join(__dirname, 'database.sqlite')
    },
    useNullAsDefault: true
});

const initDb = async () => {
    console.log('[DB] Veritabanı başlatılıyor...');

    // Runtime seeding: Eğer DB dosyası yoksa ama yedek varsa kopyala
    const dbPath = process.env.DB_PATH || path.join(__dirname, 'database.sqlite');
    const seedPath = path.join(__dirname, 'database.sqlite');

    if (dbPath !== seedPath && !fs.existsSync(dbPath) && fs.existsSync(seedPath)) {
        console.log('[DB] Yeni bir volume tespit edildi, veritabanı kopyalanıyor...');
        try {
            fs.copyFileSync(seedPath, dbPath);
            console.log('[DB] Veritabanı başarıyla kopyalandı.');
        } catch (err) {
            console.error('[DB] Veritabanı kopyalama hatası:', err.message);
        }
    }

    try {
        const hasUsers = await db.schema.hasTable('users');
        if (!hasUsers) {
            console.log('[DB] Users tablosu oluşturuluyor...');
            await db.schema.createTable('users', (table) => {
                table.increments('id').primary();
                table.string('username').unique().notNullable();
                table.string('password').notNullable();
                table.timestamps(true, true);
            });
        }

        const hasSites = await db.schema.hasTable('sites');
        if (!hasSites) {
            console.log('[DB] Sites tablosu oluşturuluyor...');
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
        console.log('[DB] Veritabanı hazır.');
    } catch (err) {
        console.error('[DB] Veritabanı şema hatası:', err.message);
        throw err;
    }
};

module.exports = { db, initDb };
