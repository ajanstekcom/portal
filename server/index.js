console.log(`[BOOT] Server başlatılıyor... Saat: ${new Date().toISOString()}`);
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb } = require('./db');
const authRoutes = require('./auth');
const siteRoutes = require('./sites');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const cookieParser = require('cookie-parser');
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});
global.io = io;

// VNC Page Registry
global.activePages = new Map();

io.on('connection', (socket) => {
    console.log(`[SOCKET] Yeni bağlantı: ${socket.id}`);

    socket.on('site-interaction', async (data) => {
        const { id, type, x, y, width, height, text, key } = data;
        const session = global.activePages.get(id.toString());
        if (!session || !session.page) return;

        try {
            if (type === 'click') {
                const viewport = session.page.viewport() || { width: 1280, height: 720 };
                const realX = Math.round((x / width) * viewport.width);
                const realY = Math.round((y / height) * viewport.height);
                await session.page.mouse.click(realX, realY);
            } else if (type === 'type') {
                await session.page.keyboard.type(text, { delay: 20 });
            } else if (type === 'key') {
                await session.page.keyboard.press(key);
            } else if (type === 'refresh') {
                await session.page.reload({ waitUntil: 'networkidle2' });
            }

            // Etkileşim sonrası hemen bir kare gönder
            const { broadcastFrame } = require('./sites_helpers'); // Dairesel bağımlılığı önlemek için
            await broadcastFrame(session.page, id);
        } catch (e) {
            console.error(`[INTERACTION ERROR] Site ${id}:`, e.message);
        }
    });

    socket.on('disconnect', () => {
        console.log(`[SOCKET] Ayrıldı: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
console.log(`[BOOT] Hedef Port: ${PORT}`);

// Middleware
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// DB-wait middleware for API routes
const waitForDb = (req, res, next) => {
    if (dbInitialized) return next();

    console.log(`[WAIT] Request came for ${req.url} but DB is not ready yet. Waiting...`);
    // Wait for up to 5 seconds, otherwise return 503
    let attempts = 0;
    const check = setInterval(() => {
        attempts++;
        if (dbInitialized) {
            clearInterval(check);
            return next();
        }
        if (attempts >= 50) { // 5 seconds (50 * 100ms)
            clearInterval(check);
            return res.status(503).json({ error: 'System is still initializing. Please try again in a moment.' });
        }
    }, 100);
};

// Apply DB-wait to all /api routes
app.use('/api', waitForDb);

// Static files for screenshots and frontend
const screenshotsPath = path.join(__dirname, '../public/screenshots');
const distPath = path.join(__dirname, '../client/dist');

// Middleware to log static requests and failures
app.use((req, res, next) => {
    if (req.url.startsWith('/assets/') || req.url.startsWith('/screenshots/')) {
        const fullPath = req.url.startsWith('/screenshots/')
            ? path.join(screenshotsPath, req.url.replace('/screenshots/', ''))
            : path.join(distPath, req.url);

        if (!fs.existsSync(fullPath)) {
            console.warn(`[STATIC 404] File missing: ${req.url} -> ${fullPath}`);
        }
    }
    next();
});

app.use('/screenshots', express.static(screenshotsPath));

// Portal assets - fallthrough: false ensures missing assets don't hit SPA catch-all
app.use('/assets', express.static(path.join(distPath, 'assets'), { fallthrough: false }));
app.use(express.static(distPath));

// Routes
app.get('/api/health', (req, res) => {
    res.json({
        status: dbInitialized ? 'ok' : 'initializing',
        timestamp: new Date(),
        uptime: process.uptime(),
        env: {
            isDesktop: process.platform === 'darwin' || process.platform === 'win32',
            platform: process.platform,
            node_env: process.env.NODE_ENV
        }
    });
});
app.use('/api/auth', authRoutes);
app.use('/api/sites', siteRoutes);

// Global Route Error Handler
app.use('/api', (err, req, res, next) => {
    console.error(`[API ERROR] ${req.method} ${req.url}:`, err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// Catch-all for SPA - Express 5.x uyumluluğu için Regex kullanıyoruz
app.get(/.*/, (req, res) => {
    // API veya Statik dosya isteğiyse (. noktası içeriyorsa) ve buraya düştüyse direkt 404
    if (req.url.startsWith('/api/') || (req.path.includes('.') && !req.path.endsWith('.html'))) {
        console.warn(`[ROUTE 404] Statik veya API hatası: ${req.url}`);
        return res.status(404).type('text/plain').send('File not found');
    }

    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        // Cache busting for index.html to ensure new asset hashes are picked up
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
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

// Start server immediately
http.listen(PORT, '0.0.0.0', () => {
    console.log(`[BOOT] Server ${PORT} portunda dinliyor (0.0.0.0)`);
    console.log('[BOOT] WebSocket aktif.');

    // Initialize DB in background
    initDb().then(() => {
        dbInitialized = true;
        console.log('[BOOT] Veritabanı başarıyla hazırlandı.');
    }).catch(err => {
        console.error('[CRITICAL] Veritabanı başlatma hatası:', err);
    });
});
