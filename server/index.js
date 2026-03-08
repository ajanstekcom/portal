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

// Middleware
app.use(cors());
app.use(cookieParser());

// Robust express.json (skip for tunnel/proxy)
app.use((req, res, next) => {
    const isTunnel = req.url.startsWith('/tunnel/') || req.cookies.portal_tunnel_id;
    if (isTunnel && !req.url.startsWith('/api')) return next();
    express.json({ limit: '10mb' })(req, res, next);
});

// Tunnel Proxy Logic
const tunnelProxy = createProxyMiddleware({
    target: 'http://localhost',
    router: async (req) => {
        const siteId = req.params.id || req.cookies.portal_tunnel_id;
        if (!siteId) return null;

        let session = global.activePages.get(siteId.toString());

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

// 1. Static Files
app.use(express.static(distPath));

// 2. API Routes
app.use('/api/auth', authRoutes);
app.use('/api/sites', siteRoutes);

// 3. Tunnel Entrance (Sets cookie)
app.use('/tunnel/:id', tunnelProxy);

// 4. Global Proxy Catch (For assets like /css/style.css inside the iframe)
app.use((req, res, next) => {
    const siteId = req.cookies.portal_tunnel_id;
    const isApi = req.url.startsWith('/api');

    // If it's not an API call and we have a tunnel session, try proxying
    if (siteId && !isApi) {
        // Check if file exists in dist (avoid hijacking portal assets)
        const possibleLocalFile = path.join(distPath, req.path);
        if (!fs.existsSync(possibleLocalFile)) {
            return tunnelProxy(req, res, next);
        }
    }
    next();
});

// 5. Catch-all SPA Fallback
app.use((req, res) => {
    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Portal build not found.');
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
