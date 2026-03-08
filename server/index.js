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

// Middleware Setup
app.use(cors());
app.use(cookieParser());

// Robust express.json (SKIP for tunnel/proxy paths)
app.use((req, res, next) => {
    if (req.url.startsWith('/tunnel/')) return next();
    express.json({ limit: '10mb' })(req, res, next);
});

// Helper to extract Site ID robustly
const getSiteId = (req) => {
    if (req.params?.id) return req.params.id;
    // Fallback detection from path: /tunnel/ID/...
    const parts = (req.originalUrl || req.url).split('/');
    if (parts[1] === 'tunnel' && parts[2]) return parts[2];
    return null;
};

// Tunnel Proxy Definition
const tunnelProxy = createProxyMiddleware({
    target: 'http://localhost', // Fallback
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
                    console.log(`[BOOT-PROXY] Session restored: ${site.url}`);
                }
            } catch (e) {
                console.error(`[PROXY-DB-ERR] ${e.message}`);
                return null;
            }
        }

        if (!session) return null;
        try { return new URL(session.url).origin; } catch (e) { return null; }
    },
    changeOrigin: true,
    secure: false,
    autoRewrite: true,
    followRedirects: true,
    agent: proxyAgent,
    selfHandleResponse: true, // For HTML base tag injection
    on: {
        proxyReq: (proxyReq, req, res) => {
            // [CRITICAL] Force raw identity encoding to avoid compression corruption
            proxyReq.setHeader('accept-encoding', 'identity');
        },
        error: (err, req, res) => {
            console.error(`[PROXY-ERR] ${req.url} -> ${err.message}`);
            if (res.headersSent) return;
            res.status(502).send(`Tunnel Error: ${err.message}`);
        },
        proxyRes: (proxyRes, req, res) => {
            const siteId = getSiteId(req) || req.cookies?.portal_tunnel_id;
            const contentType = proxyRes.headers['content-type'] || '';

            // Collect headers and strip security
            const headers = { ...proxyRes.headers };
            delete headers['x-frame-options'];
            delete headers['content-security-policy'];
            delete headers['frame-options'];

            if (contentType.includes('text/html')) {
                let bodyChunks = [];
                proxyRes.on('data', chunk => bodyChunks.push(chunk));
                proxyRes.on('end', () => {
                    let body = Buffer.concat(bodyChunks).toString();

                    // Inject <base> tag so all relative links use the tunnel prefix
                    if (siteId) {
                        const baseTag = `<base href="/tunnel/${siteId}/">`;
                        if (body.includes('<head>')) {
                            body = body.replace('<head>', `<head>${baseTag}`);
                        } else if (body.includes('<html>')) {
                            body = body.replace('<html>', `<html><head>${baseTag}</head>`);
                        } else {
                            body = baseTag + body;
                        }
                    }

                    res.set(headers);
                    res.set('content-length', Buffer.byteLength(body));
                    res.send(body);
                });
            } else {
                // Pipe non-HTML directly
                res.set(headers);
                proxyRes.pipe(res);
            }

            // Set cookie for sub-resource routing
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

// --- ROUTES ---

// 1. API - Highest priority
app.use('/api/auth', authRoutes);
app.use('/api/sites', siteRoutes);

// 2. Explicit Tunnel Route
app.use('/tunnel/:id', tunnelProxy);

// 3. Static Files (Portal Assets)
app.use(express.static(distPath));

// 4. Catch-all SPA Fallback
app.use((req, res) => {
    // SECURITY: If it was a tunnel request that reached here, it means proxy failed.
    // Return 404 instead of recursive Portal view.
    if (req.originalUrl.startsWith('/tunnel/')) {
        return res.status(502).send('Proxy rendering failed or site session expired. Please refresh.');
    }

    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
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
