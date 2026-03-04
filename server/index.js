console.log(`[BOOT] Server başlatılıyor... Saat: ${new Date().toISOString()}`);
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb } = require('./db');
const authRoutes = require('./auth');
const siteRoutes = require('./sites');

const app = express();
const PORT = process.env.PORT || 5173;
console.log(`[BOOT] Hedef Port: ${PORT}`);

// Middleware
app.use(cors());
app.use(express.json());

// Static assets check
const distPath = path.join(__dirname, '../client/dist');
if (fs.existsSync(distPath)) {
    console.log(`[BOOT] Frontend dosyaları bulundu: ${distPath}`);
} else {
    console.warn(`[BOOT] KRİTİK: Frontend dosyaları bulunamadı! Yol: ${distPath}`);
}

// Static files for screenshots and frontend
app.use('/screenshots', express.static(path.join(__dirname, '../public/screenshots')));
app.use(express.static(distPath));

// Routes
app.get('/api/health', (req, res) => {
    res.json({
        status: dbInitialized ? 'ok' : 'initializing',
        timestamp: new Date(),
        uptime: process.uptime()
    });
});
app.use('/api/auth', authRoutes);
app.use('/api/sites', siteRoutes);

// Catch-all for SPA
app.use((req, res) => {
    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Frontend build results not found. Please run build script.');
    }
});

// Global Error Handlers
process.on('uncaughtException', (err) => {
    console.error('[CRITICAL] Uncaught Exception:', err);
    // Don't exit here, wait and see if it recovers
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[WARN] Unhandled Rejection at:', promise, 'reason:', reason);
});

let dbInitialized = false;

// Initialize DB and start server
const startServer = async () => {
    // Start listening immediately to avoid 504 Gateway Timeout from proxy
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`[${new Date().toISOString()}] Server dinlemede: ${PORT}`);
    });

    try {
        console.log('[BOOT] Veritabanı başlatılıyor...');
        await initDb();
        dbInitialized = true;
        console.log('[BOOT] Sistem ve Veritabanı hazır.');
    } catch (err) {
        console.error('[CRITICAL] Veritabanı başlatılamadı:', err);
    }
};

startServer();
