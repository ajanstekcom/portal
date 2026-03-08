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

// Global Request Logger
app.use((req, res, next) => {
    if (!req.url.includes('socket.io')) {
        console.log(`[REQUEST] ${req.method} ${req.url}`);
    }
    next();
});

// Robust express.json (skip for tunnel/proxy)
app.use((req, res, next) => {
    if (req.url.startsWith('/tunnel/')) return next();
    express.json({ limit: '10mb' })(req, res, next);
});

// Helper to extract Site ID robustly
const getSiteId = (req) => {
    if (req.params?.id) return req.params.id;
    const url = req.originalUrl || req.url;
    const parts = url.split('/');
    if (parts[1] === 'tunnel' && parts[2]) return parts[2];
    const tunnelMatch = url.match(/\/tunnel\/(\d+)/);
    if (tunnelMatch) return tunnelMatch[1];
    return null;
};

// Tunnel Proxy Logic
const tunnelProxy = createProxyMiddleware({
    target: 'http://localhost',
    router: async (req) => {
        const siteId = getSiteId(req) || req.cookies?.portal_tunnel_id;
        if (!siteId) return null;

        let session = global.activePages.get(siteId.toString());
        if (!session && dbInitialized) {
            try {
                const site = await db('sites').where({ id: parseInt(siteId) }).first();
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
    followRedirects: false,
    agent: proxyAgent,
    selfHandleResponse: true,
    headers: {
        'accept-encoding': 'identity'
    },
    on: {
        error: (err, req, res) => {
            if (res.headersSent) return;
            res.status(502).send(`Tunnel Error: ${err.message}`);
        },
        proxyRes: (proxyRes, req, res) => {
            if (res.headersSent) return;

            const siteId = getSiteId(req) || req.cookies?.portal_tunnel_id;
            const contentType = proxyRes.headers['content-type'] || '';

            const headers = { ...proxyRes.headers };
            delete headers['x-frame-options'];
            delete headers['content-security-policy'];
            delete headers['frame-options'];

            // Rewrite HTML and Javascript to fix absolute paths and hardcoded URLs
            const shouldRewrite = contentType.includes('text/html') ||
                contentType.includes('javascript') ||
                contentType.includes('text/css');

            if (shouldRewrite) {
                let bodyChunks = [];
                proxyRes.on('data', chunk => bodyChunks.push(chunk));
                proxyRes.on('end', () => {
                    let body = Buffer.concat(bodyChunks).toString();

                    if (siteId) {
                        // 1. Inject <base> (HTML ONLY)
                        if (contentType.includes('text/html')) {
                            const baseTag = `<base href="/tunnel/${siteId}/">`;
                            if (body.includes('<head>')) {
                                body = body.replace('<head>', `<head>${baseTag}`);
                            } else if (body.includes('<html>')) {
                                body = body.replace('<html>', `<html><head>${baseTag}</head>`);
                            } else {
                                body = baseTag + body;
                            }
                        }

                        // 2. Rewrite Hardcoded Dev URLs (e.g. localhost:3000)
                        body = body.replace(/http:\/\/localhost:3000/g, `/tunnel/${siteId}`);

                        // 3. Rewrite Absolute API & Asset Paths (src, href, url, fetch quotes)
                        // This covers: /api/, /assets/, /static/, /wp-json/, etc.
                        body = body.replace(/(src|href|url|fetch|axios|get|post)=["']\/(api|assets|static|media|wp-content|wp-includes|@vite|@react-refresh|node_modules|src|wp-json)\//g, `$1="/tunnel/${siteId}/$2/`);

                        // 4. Broad regex for absolute paths in JS strings (e.g. "/api/login")
                        body = body.replace(/["']\/(api|assets|static|media|wp-content|wp-includes|wp-json)\//g, `"/tunnel/${siteId}/$1/`);
                    }

                    if (!res.headersSent) {
                        res.set(headers);
                        res.set('content-length', Buffer.byteLength(body));
                        res.send(body);
                    }
                });
            } else {
                if (!res.headersSent) {
                    res.set(headers);
                    proxyRes.pipe(res);
                }
            }

            if (siteId && !res.headersSent) {
                res.cookie('portal_tunnel_id', siteId.toString(), { path: '/', sameSite: 'lax', maxAge: 3600000 });
            }
        }
    },
    pathRewrite: (path, req) => {
        if (path.startsWith('/tunnel/')) {
            const parts = path.split('/');
            const rest = parts.slice(3).join('/') || '';
            return `/${rest}`;
        }
        return path;
    }
});

// --- ROUTING ---

app.use('/api/auth', authRoutes);
app.use('/api/sites', siteRoutes);
app.use('/tunnel/:id', tunnelProxy);
app.use(express.static(distPath));

// Global Interceptor for Stray Assets & APIs (The "Auto-Tunnel" catch-all)
app.use((req, res, next) => {
    const siteId = req.cookies.portal_tunnel_id;
    if (!siteId) return next();

    // If it's a request that isn't handled by Portal, and it looks like a site sub-request
    const url = req.url;
    const isPortalRoute = url.startsWith('/api/auth') || url.startsWith('/api/sites') || url.startsWith('/screenshots');

    // Ignore images, manifests etc. unless we want to catch them all?
    // Let's be aggressive for everything that is NOT a portal route.
    if (!isPortalRoute) {
        console.log(`[INTERCEPT] Routing stray request through tunnel ${siteId}: ${url}`);
        return tunnelProxy(req, res, next);
    }
    next();
});

// Catch-all SPA
app.use((req, res) => {
    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
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
