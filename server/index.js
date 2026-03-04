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

const distPath = path.join(__dirname, '../client/dist');
const isProduction = process.env.NODE_ENV === 'production';

if (fs.existsSync(distPath)) {
    console.log(`[BOOT] Frontend dosyaları bulundu: ${distPath}`);
} else if (isProduction) {
    console.warn(`[BOOT] UYARI: Frontend build (dist) bulunamadı! Yol: ${distPath}`);
}

// Static files for screenshots and frontend
app.use('/screenshots', express.static(path.join(__dirname, '../public/screenshots')));
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

// Session Tunnel (Reverse Proxy)
app.use('/tunnel/:id', async (req, res, next) => {
    const siteId = req.params.id;
    const session = global.activePages.get(siteId);

    if (!session || !session.page) {
        return res.status(404).send('Oturum bulunamadı. Lütfen Dashboard\'dan siteyi tekrar başlatın.');
    }

    try {
        const cookies = await session.page.cookies();
        const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

        return createProxyMiddleware({
            target: session.siteUrl,
            changeOrigin: true,
            secure: false,
            autoRewrite: true,
            followRedirects: true,
            onProxyReq: (proxyReq) => {
                proxyReq.setHeader('Cookie', cookieHeader);
                proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            },
            onProxyRes: (proxyRes) => {
                // Strip headers that block iframing or cross-origin access
                delete proxyRes.headers['x-frame-options'];
                delete proxyRes.headers['content-security-policy'];
                delete proxyRes.headers['x-content-security-policy'];
            },
            pathRewrite: {
                [`^/tunnel/${siteId}`]: '',
            }
        })(req, res, next);
    } catch (err) {
        console.error(`[TUNNEL ERROR] ${siteId}:`, err.message);
        res.status(500).send('Tunnel Hatası: ' + err.message);
    }
});

// Global Route Error Handler
app.use('/api', (err, req, res, next) => {
    console.error(`[API ERROR] ${req.method} ${req.url}:`, err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

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
