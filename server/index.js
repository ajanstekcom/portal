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

// Session Tunnel (Reverse Proxy)
const tunnelProxy = createProxyMiddleware({
    target: 'http://localhost',
    router: (req) => {
        const siteId = req.params.id || req.cookies.portal_tunnel_id;
        if (!siteId) return null;
        const session = global.activePages.get(siteId.toString());
        return session?.siteUrl || null;
    },
    changeOrigin: true,
    secure: false,
    autoRewrite: true,
    followRedirects: true,
    proxyTimeout: 60000,
    timeout: 60000,
    on: {
        error: (err, req, res) => {
            console.error('[PROXY ERROR]', err.message);
            res.status(504).send('Proxy Error: Target site timed out or is unavailable.');
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
        },
        proxyRes: (proxyRes, req, res) => {
            const siteId = req.params.id || req.cookies.portal_tunnel_id;
            const contentType = proxyRes.headers['content-type'] || '';

            // Strip security headers always
            delete proxyRes.headers['x-frame-options'];
            delete proxyRes.headers['content-security-policy'];
            delete proxyRes.headers['x-content-security-policy'];
            delete proxyRes.headers['content-security-policy-report-only'];

            // FIXED: Strip encoding headers because we provide plain text (injected) or original stream
            delete proxyRes.headers['content-encoding'];
            delete proxyRes.headers['transfer-encoding'];

            // Set session cookie for stickiness (important for assets)
            if (siteId) {
                res.cookie('portal_tunnel_id', siteId, { path: '/', sameSite: 'lax' });
            }

            if (contentType.includes('text/html') && siteId) {
                // HTML Injection logic
                let body = Buffer.from([]);
                proxyRes.on('data', (chunk) => { body = Buffer.concat([body, chunk]); });
                proxyRes.on('end', async () => {
                    let html = body.toString('utf8');
                    const injectionScript = `
                        <script>
                            (function() {
                                async function tryLogin() {
                                    try {
                                        const res = await fetch('/api/sites/${siteId}/credentials', {
                                            headers: { 'X-Portal-Internal': 'true' }
                                        });
                                        if (!res.ok) return;
                                        const { username, password } = await res.json();
                                        if (!username || !password) return;

                                        const userSelectors = ['input[type="text"]', 'input[type="email"]', 'input[name*="user" i]', 'input[id*="user" i]', 'input[placeholder*="eposta" i]', 'input[placeholder*="username" i]'];
                                        const passSelectors = ['input[type="password"]', 'input[name*="pass" i]', 'input[id*="id" i]', 'input[placeholder*="şifre" i]', 'input[placeholder*="password" i]'];

                                        let userInp, passInp;
                                        for (const s of userSelectors) { if (userInp = document.querySelector(s)) break; }
                                        for (const s of passSelectors) { if (passInp = document.querySelector(s)) break; }

                                        if (userInp && passInp && !userInp.value) {
                                            userInp.value = username;
                                            passInp.value = password;
                                            userInp.dispatchEvent(new Event('input', { bubbles: true }));
                                            passInp.dispatchEvent(new Event('input', { bubbles: true }));
                                            setTimeout(() => {
                                                const form = userInp.closest('form');
                                                if (form) form.submit();
                                                else passInp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                                            }, 1000);
                                        }
                                    } catch (e) { console.error("[PORTAL] Injection error:", e); }
                                }
                                if (document.readyState === 'complete') tryLogin();
                                else window.addEventListener('load', tryLogin);
                            })();
                        </script>
                    `;
                    if (html.includes('</head>')) html = html.replace('</head>', injectionScript + '</head>');
                    else if (html.includes('<body>')) html = html.replace('<body>', '<body>' + injectionScript);
                    else html = injectionScript + html;

                    const modifiedBody = Buffer.from(html, 'utf8');
                    res.writeHead(proxyRes.statusCode, {
                        ...proxyRes.headers,
                        'content-length': modifiedBody.length,
                        'content-type': 'text/html; charset=utf-8'
                    });
                    res.end(modifiedBody);
                });
            } else {
                // FIXED: Direct piping for non-HTML (JS, CSS, etc.) to preserve MIME types
                res.writeHead(proxyRes.statusCode, proxyRes.headers);
                proxyRes.pipe(res);
            }
        }
    },
    selfHandleResponse: true,
    pathRewrite: (path, req) => {
        const id = req.params.id;
        return id ? path.replace(`/tunnel/${id}`, '') : path;
    }
});

// VNC Page Registry
global.activePages = new Map();

io.on('connection', (socket) => {
    console.log(`[SOCKET] Yeni bağlantı: ${socket.id}`);
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

// Internal usage for injected script to get credentials
// PRE-AUTH to allow injected script (bot) access
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

        res.json({
            username: site.site_username,
            password: decrypt(site.site_password)
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.use('/api/sites', siteRoutes);

app.use('/tunnel/:id', tunnelProxy);

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
    // ÖNEMLİ: Assets klasörü altındaki 404'leri de yakalamalıyız
    if (req.url.startsWith('/api/') || req.url.startsWith('/assets/') || req.url.startsWith('/screenshots/') || (req.path.includes('.') && !req.path.endsWith('.html'))) {
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
