require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db');
const authRoutes = require('./auth');
const siteRoutes = require('./sites');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Static files for screenshots and frontend
app.use('/screenshots', express.static(path.join(__dirname, '../public/screenshots')));
app.use(express.static(path.join(__dirname, '../client/dist')));

// Routes
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));
app.use('/api/auth', authRoutes);
app.use('/api/sites', siteRoutes);

// Catch-all for SPA
app.use((req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist', 'index.html'));
});

// Global Error Handlers
process.on('uncaughtException', (err) => {
    console.error('[CRITICAL] Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Initialize DB and start server
const startServer = async () => {
    try {
        await initDb();
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`[${new Date().toISOString()}] Server running on port ${PORT}`);
        });
    } catch (err) {
        console.error('[CRITICAL] Failed to initialize database:', err);
        process.exit(1);
    }
};

startServer();
