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
const zlib = require('zlib');
const { HttpsProxyAgent } = require('https-proxy-agent');

// Proxy agent configuration (Hardcoded fallback for reliability)
const proxyUrl = process.env.PROXY_URL || 'http://user-ajanstek_oYp4b-country-US:PgF8Xkmle=STXap5@dc.oxylabs.io:8000';
const proxyAgent = new HttpsProxyAgent(proxyUrl, { rejectUnauthorized: false });

const app = express();
const cookieParser = require('cookie-parser');
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});
global.io = io;

// Session Tunnel (Reverse Proxy)
const tunnelProxy = createProxyMiddleware({
    target: 'http://localhost',
    router: (req) => {
        const idFromParams = req.params.id;
        const idFromCookie = req.cookies.portal_tunnel_id;
        const siteId = idFromParams || idFromCookie;

        if (!siteId) return null;

        const session = global.activePages.get(siteId.toString());
        if (!session) return null;

        // Return ONLY the origin (protocol + host) to avoid double paths on relative requests
        try {
            const targetUrl = session.siteUrl || session.initialUrl;
            const url = new URL(targetUrl);
            return url.origin;
        } catch (e) {
            return session.siteUrl;
        }
    },
    changeOrigin: true,
    secure: false,
    autoRewrite: true,
    followRedirects: true,
    agent: proxyAgent, // Use proxy from .env if defined
    proxyTimeout: 60000,
    timeout: 60000,
    on: {
        error: (err, req, res) => {
            const siteId = req.params.id || req.cookies.portal_tunnel_id;
            console.error(`[PROXY ERROR] Site ${siteId} | Request ${req.url}:`, err.message);
            // Don't send 504 for incidental asset failures to avoid breaking the whole page
            if (res.headersSent) return;
            res.status(504).send(`Proxy Error: Target site timed out or is unavailable (Site: ${siteId}, Error: ${err.message})`);
        },
        proxyReq: async (proxyReq, req, res) => {
            const siteId = req.params.id || req.cookies.portal_tunnel_id;
            const session = global.activePages.get(siteId?.toString());
            if (session && session.page) {
                try {
                    const cookies = await session.page.cookies();
                    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
                    proxyReq.setHeader('Cookie', cookieHeader);
                } catch (e) {
                    console.error("[TUNNEL COOKIE ERROR]", e.message);
                }
            }
            proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            proxyReq.setHeader('accept-encoding', 'identity'); // Disable compression for injection
            proxyReq.setHeader('Connection', 'keep-alive');

            // Fix for POST bodies being "eaten" by express.json()
            if (req.body && Object.keys(req.body).length > 0) {
                const bodyData = JSON.stringify(req.body);
                proxyReq.setHeader('Content-Type', 'application/json');
                proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
                proxyReq.write(bodyData);
            }
        },
        proxyRes: (proxyRes, req, res) => {
            // Strip security headers always to allow iframing
            delete proxyRes.headers['x-frame-options'];
            delete proxyRes.headers['content-security-policy'];
            delete proxyRes.headers['x-content-security-policy'];
            delete proxyRes.headers['content-security-policy-report-only'];

            // Set session cookie for stickiness (important for assets)
            const siteId = req.params.id || req.cookies.portal_tunnel_id;
            if (siteId) {
                res.cookie('portal_tunnel_id', siteId, { path: '/', sameSite: 'lax' });
            }
        }
    },
    selfHandleResponse: false,
    pathRewrite: (path, req) => {
        // Only rewrite if it's the primary tunnel mount
        if (path.startsWith('/tunnel/')) {
            const id = req.params.id || path.split('/')[2];
            return path.replace(`/tunnel/${id}`, '') || '/';
        }
        return path;
    }
});

// VNC Page Registry
global.activePages = new Map();

io.on('connection', (socket) => {
    console.log(`[SOCKET] Yeni bağlantı: ${socket.id}`);
});

const PORT = process.env.PORT || 3000;
console.log(`[BOOT] Hedef Port: ${PORT}`);

// Middleware (Exclude proxy paths from global body parsing to avoid "drained stream" issues)
app.use(cors());
app.use((req, res, next) => {
    if (req.url.startsWith('/tunnel/') || req.url.startsWith('/api/cors-proxy')) {
        return next();
    }
    express.json()(req, res, next);
});
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
app.use('/assets', express.static(path.join(distPath, 'assets'), { fallthrough: true }));
app.use(express.static(distPath));

// Routes
// 1. CORS Bypass Proxy (En tepede olmalı ki diğer route'lara çarpmadan yakalasın)
app.all('/api/cors-proxy', (req, res, next) => {
    const targetUrl = req.headers['x-target-url'] || req.query.url;
    console.log(`[CORS PROXY] ${req.method} -> ${targetUrl}`);
    if (!targetUrl) return res.status(400).send('Target URL required');
    next();
}, createProxyMiddleware({
    router: (req) => {
        const targetUrl = req.headers['x-target-url'] || req.query.url;
        try { return new URL(targetUrl).origin; } catch (e) { return null; }
    },
    changeOrigin: true,
    agent: proxyAgent,
    secure: false, // Sertifika hatalarını görmezden gel
    on: {
        error: (err, req, res) => {
            console.error("[CORS PROXY ERROR]", err.message);
            if (!res.headersSent) res.status(502).send("Proxy Error: " + err.message);
        },
        proxyReq: (proxyReq, req) => {
            const targetUrl = req.headers['x-target-url'] || req.query.url;
            if (targetUrl) {
                const url = new URL(targetUrl);
                proxyReq.setHeader('host', url.host);
                proxyReq.setHeader('origin', url.origin);
                proxyReq.setHeader('referer', url.origin);

                // POST Body Restream
                if (req.body && Object.keys(req.body).length > 0) {
                    const bodyData = JSON.stringify(req.body);
                    proxyReq.setHeader('Content-Type', 'application/json');
                    proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
                    proxyReq.write(bodyData);
                }
            }
        },
        proxyRes: (proxyRes) => {
            proxyRes.headers['access-control-allow-origin'] = '*';
            proxyRes.headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS, PATCH';
            proxyRes.headers['access-control-allow-headers'] = '*';
            proxyRes.headers['access-control-allow-credentials'] = 'true';
        }
    },
    pathRewrite: (path, req) => {
        const targetUrl = req.headers['x-target-url'] || req.query.url;
        try {
            const url = new URL(targetUrl);
            return url.pathname + url.search;
        } catch (e) { return path; }
    }
}));

// 2. Auth & App Routes
app.use('/api/auth', authRoutes);
app.get('/api/sites/:id/credentials', async (req, res) => {
    // Only allow requests from our tunnel or internal referers
    if (req.headers['x-portal-internal'] !== 'true' && !req.headers.referer?.includes('/tunnel/')) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    try {
        const { db } = require('./db');
        const { decrypt } = require('./utils/crypto');
        const site = await db('sites').where({ id: req.params.id }).first();
        if (!site || !site.requires_login) return res.status(404).json({ error: 'Not found' });
        res.json({ username: site.site_username, password: decrypt(site.site_password) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.use('/api/sites', siteRoutes);

// Global Tunnel Fallback (for root-relative assets)
app.use((req, res, next) => {
    const portalTunnelId = req.cookies.portal_tunnel_id;
    if (!portalTunnelId ||
        req.url.startsWith('/tunnel/') ||
        req.url === '/' ||
        req.url.startsWith('/api/') ||
        req.url.startsWith('/screenshots/')) {
        return next();
    }

    // SADECE aktif bir oturum varsa proxy'ye gönder (Ancak portalın kendi assetleri değilse)
    if (global.activePages.has(portalTunnelId.toString())) {
        // Eğer bu bir asset isteğiyse ve bizim dist klasörümüzde yoksa (üstteki express.static'lerden geçmediyse buraya gelir)
        // Proxied sitenin asseti olabilir.
        return tunnelProxy(req, res, next);
    }
    next();
});

// Ana tünel endpoint'i için oturum kontrolü
app.use('/tunnel/:id', (req, res, next) => {
    const siteId = req.params.id;
    if (!global.activePages.has(siteId.toString())) {
        return res.status(404).send('<!DOCTYPE html><html><body style="background:#0f172a;color:#94a3b8;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0"><div><h2>Oturum Zaman Aşımına Uğradı</h2><p>Lütfen sayfayı kapatıp Dashboard üzerinden tekrar açın.</p></div></body></html>');
    }
    next();
}, tunnelProxy);

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
    // SPA Catch-all: Return 404 for ANY missing file with an extension (except .html)
    // This prevents MIME type errors (text/html instead of text/css)
    const isAsset = req.path.includes('.') && !req.path.endsWith('.html');
    if (req.url.startsWith('/api/') || req.url.startsWith('/assets/') || req.url.startsWith('/screenshots/') || isAsset) {
        if (isAsset) console.warn(`[ASSET 404] Missing asset requested: ${req.url}`);
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
