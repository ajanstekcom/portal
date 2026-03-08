const express = require('express');
const { db } = require('./db');
const { encrypt, decrypt } = require('./utils/crypto');
const router = express.Router();

// Middleware to verify JWT
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const secret = process.env.JWT_SECRET || 'supersecretkey123';
        const decoded = require('jsonwebtoken').verify(token, secret);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

router.use(authenticate);

// --- API ROUTES ---

// List sites
router.get('/', async (req, res) => {
    try {
        const sites = await db('sites').where({ user_id: req.user.id }).orderBy('created_at', 'desc');
        const decryptedSites = sites.map(s => ({
            ...s,
            site_password: s.site_password ? decrypt(s.site_password) : null
        }));
        res.json(decryptedSites);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// "Open" site (Registers it in global cache for proxy)
router.get('/:id/open', async (req, res) => {
    try {
        const site = await db('sites').where({ id: req.params.id, user_id: req.user.id }).first();
        if (!site) return res.status(404).json({ error: 'Site bulunamadı' });

        // Register in global cache so tunnelProxy knows where to go
        global.activePages.set(site.id.toString(), {
            url: site.url,
            lastActivity: Date.now()
        });

        res.json({ message: 'Site hazır, tünel açılıyor...', url: site.url });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Add site
router.post('/', async (req, res) => {
    try {
        const { name, url, requires_login, site_username, site_password } = req.body;
        if (!name || !url) return res.status(400).json({ error: 'İsim ve URL gerekli' });

        const formattedUrl = url.startsWith('http') ? url : `https://${url}`;

        const [id] = await db('sites').insert({
            user_id: req.user.id,
            name,
            url: formattedUrl,
            requires_login: !!requires_login,
            site_username: requires_login ? site_username : null,
            site_password: requires_login ? encrypt(site_password) : null,
            status: 'Aktif'
        });

        res.status(201).json({ message: 'Site eklendi', id });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Delete site
router.delete('/:id', async (req, res) => {
    try {
        await db('sites').where({ id: req.params.id, user_id: req.user.id }).del();
        global.activePages.delete(req.params.id.toString());
        res.json({ message: 'Site silindi' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;