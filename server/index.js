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

// Robust express.json (SKIP for tunnel/proxy to avoid body parsing issues)
app.use((req, res, next) => {
    const isTunnel = req.url.startsWith('/tunnel/') || req.cookies.portal_tunnel_id;
    if (isTunnel && !req.url.startsWith('/api')) return next();
    express.json({ limit: '10mb' })(req, res, next);
});

// Tunnel Proxy Logic
const tunnelProxy = createProxyMiddleware({
    target: 'http://localhost',
    router: async (req) => {
        // Fallback siteId detection from URL if params are missing
        let siteId = req.params?.id || req.cookies?.portal_tunnel_id;
        if (!siteId && req.url.startsWith('/tunnel/')) {
            const parts = req.url.split('/');
            siteId = parts[2];
        }

        if (!siteId) return null;

        let session = global.activePages.get(siteId.toString());

        if (!session && dbInitialized) {
            try {
                const site = await db('sites').where({ id: siteId }).first();
                if (site) {
                    session = { url: site.url };
                    global.activePages.set(siteId.toString(), session);
                    console.log(`[PROXY] Session restored for site ${siteId}: ${site.url}`);
                }
            } catch (e) {
                console.error(`[PROXY] DB Session Fetch Error: ${e.message}`);
                return null;
            }
        }

        if (!session) {
            console.warn(`[PROXY] No session found for ID: ${siteId}`);
            return null;
        }

        try {
            const target = new URL(session.url).origin;
            console.log(`[PROXY] Routing ${req.url} -> ${target}`);
            return target;
        } catch (e) {
            console.error(`[PROXY] Invalid URL in session: ${session.url}`);
            return null;
        }
    },
    changeOrigin: true,
    secure: false,
    autoRewrite: true,
    headers: {
        'Connection': 'keep-alive'
    },
    followRedirects: true,
    agent: proxyAgent,
    on: {
        error: (err, req, res) => {
            console.error(`[PROXY ERROR] ${req.url} -> ${err.message}`);
            if (res.headersSent) return;
            res.status(502).send(`Tunnel Error: ${err.message}`);
        },
        proxyRes: (proxyRes, req, res) => {
            // Strip security headers
            delete proxyRes.headers['x-frame-options'];
            delete proxyRes.headers['content-security-policy'];
            delete proxyRes.headers['frame-options'];

            // Set/Refresh tunnel cookie
            let siteId = req.params?.id || req.cookies?.portal_tunnel_id;
            if (!siteId && req.url.startsWith('/tunnel/')) {
                siteId = req.url.split('/')[2];
            }
            if (siteId) {
                res.cookie('portal_tunnel_id', siteId, { path: '/', sameSite: 'lax', maxAge: 3600000 });
            }
        }
    },
    pathRewrite: (path, req) => {
        if (path.startsWith('/tunnel/')) {
            const parts = path.split('/');
            const id = parts[2];
            const rest = parts.slice(3).join('/') || '';
            return `/${rest}`;
        }
        return path;
    }
});

// 1. Static Files (Vite Build)
app.use(express.static(distPath));

// 2. API Routes
app.use('/api/auth', authRoutes);
app.use('/api/sites', siteRoutes);

// 3. Tunnel Entrance (Sets cookie and proxies)
app.use('/tunnel/:id', (req, res, next) => {
    // Force set cookie on initial hit to ensure sub-resources work
    res.cookie('portal_tunnel_id', req.params.id, { path: '/', sameSite: 'lax' });
    next();
}, tunnelProxy);

// 4. Global Proxy Catch (For assets like /css/style.css inside the iframe)
app.use((req, res, next) => {
    const siteId = req.cookies.portal_tunnel_id;
    const isApi = req.url.startsWith('/api');

    // If it's a sub-resource and we are in a tunnel context
    if (siteId && !isApi) {
        // Check if it's a portal asset first
        const possibleLocalFile = path.join(distPath, req.path);
        if (!fs.existsSync(possibleLocalFile)) {
            // It's likely a proxied asset
            return tunnelProxy(req, res, next);
        }
    }
    next();
});

// 5. Catch-all SPA Fallback
app.use((req, res) => {
    // If it's a tunnel-prefixed request that reached here, something is wrong
    if (req.url.startsWith('/tunnel/')) {
        return res.status(404).send('Proxy rendering failed. Please refresh.');
    }

    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Portal build not found. Running in dev-only?');
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
