require('dotenv').config();
const PORT_CONFIG = process.env.PORT || 5173;
console.log(`[BOOT] Server başlatılıyor... Port: ${PORT_CONFIG} | Saat: ${new Date().toISOString()}`);

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { HttpsProxyAgent } = require('https-proxy-agent');
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

// Proxy agent configuration
const proxyUrl = process.env.PROXY_URL || 'http://user-ajanstek_oYp4b-country-US:PgF8Xkmle=STXap5@dc.oxylabs.io:8000';
const proxyAgent = new HttpsProxyAgent(proxyUrl, { rejectUnauthorized: false });

// 0. Global Logger
app.use((req, res, next) => {
    console.log(`[REQ] ${req.method} ${req.url}`);
    next();
});

// 1. Health Checks (TOP PRIORITY)
app.get('/api/health', (req, res) => res.send('OK'));
app.get('/health', (req, res) => res.send('OK'));
app.get('/api/health-check', (req, res) => res.send('OK - ' + new Date().toISOString()));

// Session Tunnel Proxy (Root Level)
const tunnelProxy = createProxyMiddleware({
    target: 'http://localhost',
    router: (req) => {
        const idFromParams = req.params.id;
        const idFromCookie = req.cookies.portal_tunnel_id;
        const siteId = idFromParams || idFromCookie;
        if (!siteId) return null;
        const session = global.activePages.get(siteId.toString());
        if (!session) return null;
        try {
            const targetUrl = session.siteUrl || session.initialUrl;
            return new URL(targetUrl).origin;
        } catch (e) { return session.siteUrl; }
    },
    changeOrigin: true,
    secure: false,
    autoRewrite: true,
    followRedirects: true,
    agent: proxyAgent,
    proxyTimeout: 120000,
    timeout: 120000,
    on: {
        error: (err, req, res) => {
            if (res.headersSent) return;
            const status = err.code === 'ETIMEDOUT' ? 504 : 502;
            res.status(status).send(`Proxy Error (${err.code})`);
        },
        proxyReq: (proxyReq, req) => {
            proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            proxyReq.setHeader('accept-encoding', 'identity');
            if (req.body && Object.keys(req.body).length > 0) {
                const bodyData = JSON.stringify(req.body);
                proxyReq.setHeader('Content-Type', 'application/json');
                proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
                proxyReq.write(bodyData);
            }
        },
        proxyRes: (proxyRes, req, res) => {
            delete proxyRes.headers['x-frame-options'];
            delete proxyRes.headers['content-security-policy'];
            const siteId = req.params.id || req.cookies.portal_tunnel_id;
            if (siteId) res.cookie('portal_tunnel_id', siteId, { path: '/', sameSite: 'lax' });
        }
    },
    pathRewrite: (path, req) => {
        if (path.startsWith('/tunnel/')) {
            const id = req.params.id || path.split('/')[2];
            return path.replace(`/tunnel/${id}`, '') || '/';
        }
        return path;
    }
});

// Middleware
app.use(cors());
app.use(cookieParser());

// Robust express.json (skip for proxies)
app.use((req, res, next) => {
    if (req.url.startsWith('/tunnel/') || req.url.startsWith('/api/cors-proxy')) return next();
    express.json({ limit: '10mb' })(req, res, next);
});

// DB-wait
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
            return res.status(503).json({ error: 'System is initializing...' });
        }
    }, 100);
};

// API Router
const apiRouter = express.Router();

// CORS Proxy (Independent of DB)
apiRouter.all('/cors-proxy', (req, res, next) => {
    const targetUrl = req.headers['x-target-url'] || req.query.url;
    if (!targetUrl) return res.status(400).send('Target URL required');
    next();
}, createProxyMiddleware({
    router: (req) => {
        const targetUrl = req.headers['x-target-url'] || req.query.url;
        try { return new URL(targetUrl).origin; } catch (e) { return null; }
    },
    changeOrigin: true,
    agent: proxyAgent,
    secure: false,
    proxyTimeout: 120000,
    timeout: 120000,
    on: {
        error: (err, req, res) => {
            if (!res.headersSent) res.status(err.code === 'ETIMEDOUT' ? 504 : 502).send(`CORS Proxy Error: ${err.message}`);
        },
        proxyReq: (proxyReq, req) => {
            const targetUrl = req.headers['x-target-url'] || req.query.url;
            if (targetUrl) {
                const url = new URL(targetUrl);
                proxyReq.setHeader('host', url.host);
                proxyReq.setHeader('origin', url.origin);
                proxyReq.setHeader('referer', url.origin);
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
            proxyRes.headers['access-control-allow-methods'] = '*';
            proxyRes.headers['access-control-allow-headers'] = '*';
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

// Auth & Sites (Needs DB)
apiRouter.use((req, res, next) => waitForDb(req, res, next));
apiRouter.use('/auth', authRoutes);
apiRouter.use('/sites', siteRoutes);

app.use('/api', apiRouter);

// Static files
const distPath = path.resolve(__dirname, '../client/dist');
const screenshotsPath = path.resolve(__dirname, '../public/screenshots');
app.use('/screenshots', express.static(screenshotsPath));
app.use('/assets', express.static(path.join(distPath, 'assets')));
app.use(express.static(distPath));

// Tunnel routes
app.use('/tunnel/:id', (req, res, next) => {
    if (!global.activePages.has(req.params.id.toString())) return res.status(404).send('Session expired');
    next();
}, tunnelProxy);

global.activePages = new Map();

// Catch-all SPA
app.get(/.*/, (req, res) => {
    const isAsset = req.path.includes('.') && !req.path.endsWith('.html');
    if (req.url.startsWith('/api/') || isAsset) return res.status(404).send('Not found');
    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) res.sendFile(indexPath);
    else res.status(404).send('Build not found');
});

http.listen(PORT_CONFIG, '0.0.0.0', () => {
    console.log(`[BOOT] Server ${PORT_CONFIG} portunda dinliyor (0.0.0.0)`);
    initDb().then(() => {
        dbInitialized = true;
        console.log('[BOOT] Veritabanı hazır.');
    }).catch(err => { console.error('[BOOT] DB Error:', err); });
});
