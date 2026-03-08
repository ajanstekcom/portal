require('dotenv').config();
const PORT_CONFIG = process.env.PORT || 5173;
console.log(`[BOOT] Server başlatılıyor... Port: ${PORT_CONFIG}`);

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { initDb, db } = require('./db');
const authRoutes = require('./auth');
const siteRoutes = require('./sites');

const distPath = path.resolve(__dirname, '../client/dist');
const app = express();
const http = require('http').createServer(app);

// [CRITICAL] Initialize globals
global.activePages = new Map();
let dbInitialized = false;

// Proxy agent configuration (Oxylabs)
const proxyUrl = process.env.PROXY_URL || 'http://user-ajanstek_oYp4b-country-US:PgF8Xkmle=STXap5@dc.oxylabs.io:8000';
const proxyAgent = new HttpsProxyAgent(proxyUrl, { rejectUnauthorized: false });

// 0. Static Files (Kritik: En üstte)
app.use(express.static(distPath));

// Tunnel Proxy Logic
const tunnelProxy = createProxyMiddleware({
    target: 'http://localhost',
    router: async (req) => {
        const siteId = req.params.id || req.cookies.portal_tunnel_id;
        if (!siteId) return null;

        let session = global.activePages.get(siteId.toString());

        // If not in cache, fallback to DB
        if (!session && dbInitialized) {
            try {
                const site = await db('sites').where({ id: siteId }).first();
                if (site) {
                    session = { url: site.url };
                    global.activePages.set(siteId.toString(), session);
                }
            } catch (e) { return null; }
        }

        if (!session) return null;
        try { return new URL(session.url).origin; } catch (e) { return null; }
    },
    changeOrigin: true,
    secure: false,
    autoRewrite: true,
    followRedirects: true,
    agent: proxyAgent,
    on: {
        error: (err, req, res) => {
            if (res.headersSent) return;
            res.status(502).send(`Tunnel Error: ${err.message}`);
        },
        proxyRes: (proxyRes, req, res) => {
            // Strip security headers to allow framing
            delete proxyRes.headers['x-frame-options'];
            delete proxyRes.headers['content-security-policy'];
            delete proxyRes.headers['frame-options'];

            const siteId = req.params.id || req.cookies.portal_tunnel_id;
            if (siteId) {
                res.cookie('portal_tunnel_id', siteId, { path: '/', sameSite: 'lax' });
            }
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
app.use((req, res, next) => {
    if (req.url.startsWith('/tunnel/')) return next();
    express.json({ limit: '10mb' })(req, res, next);
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/sites', siteRoutes);

// Tunnel Route
app.use('/tunnel/:id', tunnelProxy);

// Catch-all SPA
app.use((req, res) => {
    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Portal build not found. Please build the client.');
    }
});

// Boot
http.listen(PORT_CONFIG, '0.0.0.0', () => {
    console.log(`[BOOT] Server ready on port ${PORT_CONFIG}`);
    initDb().then(() => {
        dbInitialized = true;
        console.log('[BOOT] Database connected.');
    });
});
