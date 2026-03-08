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
    if (req.url.startsWith('/tunnel/')) return next();
    express.json({ limit: '10mb' })(req, res, next);
});

// Tunnel Proxy Logic with HTML Rewriting & Encoding Fix
const tunnelProxy = createProxyMiddleware({
    target: 'http://localhost',
    router: async (req) => {
        // [FIX] Correctly extract siteId from params or URL path
        let siteId = req.params?.id;
        if (!siteId) {
            // Fallback for cases where it's called as a middleware without params
            const parts = req.originalUrl.split('/');
            if (parts[1] === 'tunnel') siteId = parts[2];
        }

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
    selfHandleResponse: true, // Crucial for injecting <base>
    on: {
        proxyReq: (proxyReq, req, res) => {
            // [CRITICAL] Force identity encoding to prevent compressed body corruption
            proxyReq.setHeader('accept-encoding', 'identity');
        },
        error: (err, req, res) => {
            if (res.headersSent) return;
            res.status(502).send(`Tunnel Error: ${err.message}`);
        },
        proxyRes: (proxyRes, req, res) => {
            const parts = req.originalUrl.split('/');
            const siteId = parts[2] || req.params?.id;
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

                    // [BEHAVIOR] Inject <base> tag so all relative assets map to /tunnel/ID/
                    const baseTag = `<base href="/tunnel/${siteId}/">`;
                    if (body.includes('<head>')) {
                        body = body.replace('<head>', `<head>${baseTag}`);
                    } else if (body.includes('<html>')) {
                        body = body.replace('<html>', `<html><head>${baseTag}</head>`);
                    } else {
                        body = baseTag + body;
                    }

                    res.set(headers);
                    res.set('content-length', Buffer.byteLength(body));
                    res.send(body);
                });
            } else {
                // Pipe non-HTML assets directly
                res.set(headers);
                proxyRes.pipe(res);
            }
        }
    },
    pathRewrite: (path, req) => {
        // Rewrite /tunnel/ID/path -> /path
        if (path.startsWith('/tunnel/')) {
            const parts = path.split('/');
            const rest = parts.slice(3).join('/') || '';
            return `/${rest}`;
        }
        return path;
    }
});

// [1] Static Files (Portal)
app.use(express.static(distPath));

// [2] API Routes
app.use('/api/auth', authRoutes);
app.use('/api/sites', siteRoutes);

// [3] Tunnel Route (The ONLY proxy entry)
app.use('/tunnel/:id', tunnelProxy);

// [4] Catch-all SPA
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
