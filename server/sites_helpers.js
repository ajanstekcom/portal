const { db } = require('./db');
const path = require('path');
const fs = require('fs');

async function updateStatus(id, status) {
    try {
        await db('sites').where({ id }).update({ status });
        if (global.io) {
            global.io.emit(`site-status-${id}`, { status });
        }
    } catch (e) {
        console.error("DB Güncelleme Hatası:", e.message);
    }
}

async function broadcastFrame(page, id) {
    if (!global.io) return;
    try {
        const screenshot = await page.screenshot({
            encoding: 'base64',
            type: 'jpeg',
            quality: 30
        });
        global.io.emit(`site-frame-${id}`, { image: screenshot });
    } catch (e) { }
}

module.exports = { updateStatus, broadcastFrame };
