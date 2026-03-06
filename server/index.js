console.log(`[BOOT] Server başlatılıyor... Saat: ${new Date().toISOString()}`);
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const { initDb } = require('./db');
const authRoutes = require('./auth');
const siteRoutes = require('./sites');

const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});
global.io = io;

let dbInitialized = false;

// 0. Global Logger
app.use((req, res, next) => {
    console.log(`[REQ] ${req.method} ${req.url}`);
    next();
});

// 1. Health Checks (Critical for Docker)
app.get('/api/health', (req, res) => res.send('OK'));
app.get('/health', (req, res) => res.send('OK'));

// Middleware
app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));

// DB-wait middleware
const waitForDb = (req, res, next) => {
    if (dbInitialized) return next();
    let attempts = 0;
    const check = setInterval(() => {
        attempts++;
        if (dbInitialized) {
            clearInterval(check);
            return next();
        }
        if (attempts >= 50) {
            clearInterval(check);
            return res.status(503).json({ error: 'Initializing...' });
        }
    }, 100);
};

// API Routes
app.use('/api', (req, res, next) => {
    if (req.url === '/health') return next();
    waitForDb(req, res, next);
});

app.use('/api/auth', authRoutes);
app.use('/api/sites', siteRoutes);

// Static files
const distPath = path.resolve(__dirname, '../client/dist');
const screenshotsPath = path.resolve(__dirname, '../public/screenshots');

app.use('/screenshots', express.static(screenshotsPath));
app.use('/assets', express.static(path.join(distPath, 'assets')));
app.use(express.static(distPath));

// Registry for active browser pages (Non-proxied version uses webhooks or direct socket communication)
global.activePages = new Map();

// Catch-all for SPA
app.get(/.*/, (req, res) => {
    const isAsset = req.path.includes('.') && !req.path.endsWith('.html');
    if (req.url.startsWith('/api/') || isAsset) {
        return res.status(404).send('Not found');
    }
    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Build not found');
    }
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
    console.log(`[BOOT] Server ${PORT} portunda dinliyor`);
    initDb().then(() => {
        dbInitialized = true;
        console.log('[BOOT] Veritabanı hazır.');
    }).catch(err => {
        console.error('[BOOT] DB Hatası:', err);
    });
});
