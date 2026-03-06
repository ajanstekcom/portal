const express = require('express');
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { db } = require('./db');
const { encrypt, decrypt } = require('./utils/crypto');
const router = express.Router();

// Middleware to verify JWT
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
        console.warn(`[AUTH] Unauthorized: No token provided for ${req.url}`);
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const secret = process.env.JWT_SECRET || 'supersecretkey123';
        const decoded = require('jsonwebtoken').verify(token, secret);
        req.user = decoded;
        next();
    } catch (error) {
        console.warn(`[AUTH] Invalid token for ${req.url}: ${error.message}`);
        res.status(401).json({ error: 'Invalid token' });
    }
};

router.use(authenticate);

// --- SABİTLER ---
const getChromePath = () => {
    if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

    const platform = process.platform;
    if (platform === 'darwin') {
        return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    } else if (platform === 'win32') {
        return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    } else {
        // Linux / Docker
        return '/usr/bin/google-chrome-stable';
    }
};

const EXECUTABLE_PATH = getChromePath();
const delay = (ms) => new Promise(res => setTimeout(res, ms));

const { updateStatus, broadcastFrame } = require('./sites_helpers');

async function performSmartLogin(page, site, id = null) {
    if (id) await updateStatus(id, 'Giriş deneniyor...');
    console.log(`[LOGIN] ${site.name} için giriş başlatıldı: ${site.url}`);

    try {
        await delay(2000);

        const userSelectors = ['input[type="text"]', 'input[type="email"]', 'input[name*="user" i]', 'input[id*="user" i]', 'input[placeholder*="eposta" i]', 'input[placeholder*="username" i]'];
        const passSelectors = ['input[type="password"]', 'input[name*="pass" i]', 'input[id*="id" i]', 'input[placeholder*="şifre" i]', 'input[placeholder*="password" i]'];

        let userEl, passEl;
        for (const s of userSelectors) { if (userEl = await page.$(s)) break; }
        for (const s of passSelectors) { if (passEl = await page.$(s)) break; }

        if (!userEl && !passEl) {
            console.log("[LOGIN] Form bulunamadı, giriş butonu aranıyor...");
            const loginBtn = await page.$('button::-p-text(Admin Girişi)') ||
                await page.$('a::-p-text(Admin Girişi)') ||
                await page.$('button::-p-text(Giriş Yap)') ||
                await page.$('button::-p-text(LOGIN)');

            if (loginBtn) {
                console.log("[LOGIN] Giriş butonu bulundu, tıklanıyor...");
                await loginBtn.click();
                await delay(2000);
                for (const s of userSelectors) { if (userEl = await page.$(s)) break; }
                for (const s of passSelectors) { if (passEl = await page.$(s)) break; }
            }
        }

        if (userEl && passEl) {
            console.log("[LOGIN] Form elemanları bulundu, bilgiler giriliyor...");
            await userEl.click({ clickCount: 3 });
            await page.keyboard.press('Backspace');
            await userEl.type(site.site_username, { delay: 50 });

            await passEl.click({ clickCount: 3 });
            await page.keyboard.press('Backspace');

            const decryptedPassword = decrypt(site.site_password);
            await passEl.type(decryptedPassword || '', { delay: 50 });
            await broadcastFrame(page, id);

            // Yedek Plan: Eğer type işe yaramadıysa (JS ile set et)
            await page.evaluate((u, p, us, ps) => {
                const userInp = document.querySelector(us);
                const passInp = document.querySelector(ps);
                if (userInp && !userInp.value) userInp.value = u;
                if (passInp && !passInp.value) passInp.value = p;
            }, site.site_username, decryptedPassword, userSelectors.join(','), passSelectors.join(','));

            await updateStatus(id, 'Giriş Yapılıyor...');
            console.log("[LOGIN] Giriş yapılıyor...");
            await page.keyboard.press('Enter');
            // Canlı akışı başlat
            const streamInterval = setInterval(() => broadcastFrame(page, id), 1000);
            await page.waitForNavigation({ waitUntil: 'networkidle1', timeout: 10000 }).catch(() => { });

            if (typeof streamInterval !== 'undefined') clearInterval(streamInterval);
            await broadcastFrame(page, id);
            await updateStatus(id, 'Tamamlandı');
            console.log("[LOGIN] İşlem tamamlandı.");
        } else {
            console.log("[LOGIN] Form elemanları bulunamadı (Username/Password inputları yok).");
        }
    } catch (err) {
        console.error("[LOGIN] Kritik hata:", err.message);
    }
}

// --- API ROUTES ---

router.get('/', async (req, res) => {
    try {
        const sites = await db('sites').where({ user_id: req.user.id }).orderBy('created_at', 'desc');
        // Şifreleri çözerek frontend'e gönderiyoruz (gerekliyse)
        const decryptedSites = sites.map(s => ({
            ...s,
            site_password: s.site_password ? decrypt(s.site_password) : null
        }));
        res.json(decryptedSites);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/:id/open', async (req, res) => {
    try {
        const site = await db('sites').where({ id: req.params.id, user_id: req.user.id }).first();
        if (!site) return res.status(404).json({ error: 'Site bulunamadı' });

        openInteractiveBrowser(site);
        res.json({ message: 'Tarayıcı penceresi açılıyor...' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

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
            site_password: requires_login ? encrypt(site_password) : null, // Şifreyi mühürleyerek kaydet
            status: 'Hazırlanıyor...'
        });

        takeSmartScreenshot(id, formattedUrl);
        res.status(201).json({ message: 'Site listeye eklendi', id });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.delete('/:id', async (req, res) => {
    try {
        const site = await db('sites').where({ id: req.params.id, user_id: req.user.id }).first();
        if (site && site.screenshot_path) {
            const fullPath = path.join(__dirname, '../public', site.screenshot_path);
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        }
        await db('sites').where({ id: req.params.id, user_id: req.user.id }).del();
        res.json({ message: 'Site silindi' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// --- ANA MANTIĞIN ÇALIŞTIĞI YER ---

async function openInteractiveBrowser(site) {
    // FIXED: Early session registration to prevent race condition with tunnel proxy
    global.activePages.set(site.id.toString(), {
        status: 'loading',
        initialUrl: site.url,
        siteUrl: site.url,
        lastActivity: Date.now()
    });

    let browser;
    const port = 9100 + (parseInt(site.id) % 500);
    // Profil yolundan Date.now()'u çıkardık, böylece oturumlar (cookie) kalıcı olur.
    const profilePath = path.join(os.tmpdir(), `portal-site-profile-${site.id}`);

    try {
        // Önce çalışan bir instance var mı kontrol et
        browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, defaultViewport: null });
    } catch (e) {
        // Yoksa yeni aç
        const isLinux = process.platform === 'linux';
        browser = await puppeteer.launch({
            executablePath: EXECUTABLE_PATH,
            headless: isLinux ? "new" : false, // Linux sunucularda ekran olmadığı için headless zorunlu
            userDataDir: profilePath,
            defaultViewport: null,
            ignoreDefaultArgs: ['--enable-automation'], // Otomasyon uyarısını bir miktar azaltır
            args: [
                '--start-maximized',
                `--remote-debugging-port=${port}`,
                '--no-first-run',
                '--no-default-browser-check',
                '--new-window',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage'
            ]
        });
    }

    try {
        const pages = await browser.pages();
        let page = pages.find(p => p.url().includes(site.url)) || (pages.length > 0 ? pages[0] : await browser.newPage());

        await page.bringToFront();

        // Sayfa boşsa veya yanlış yerdeyse yönlendir
        if (page.url() === 'about:blank' || !page.url().includes(site.url)) {
            console.log(`[BROWSER] ${site.name} için sayfaya gidiliyor...`);
            await page.goto(site.url, { waitUntil: 'networkidle2', timeout: 60000 }).catch(e => {
                console.warn(`[BROWSER] Sayfa yükleme uyarısı: ${e.message}`);
            });
        }

        if (site.requires_login) {
            await performSmartLogin(page, site, site.id);
        } else {
            await broadcastFrame(page, site.id);
        }

        // Sayfa kaydını güncelle
        global.activePages.set(site.id.toString(), {
            page,
            browser,
            siteUrl: page.url().includes('about:blank') ? site.url : page.url(),
            initialUrl: site.url,
            lastActivity: Date.now()
        });

        // Sürekli yayın (Kullanıcı modalı açık tuttuğu sürece)
        const frameInterval = setInterval(async () => {
            if (page.isClosed()) {
                clearInterval(frameInterval);
                global.activePages.delete(site.id.toString());
                return;
            }
            await broadcastFrame(page, site.id);
        }, 1000);

    } catch (err) {
        console.error(`[BROWSER] ${site.name} penceresinde hata:`, err.message);
        await updateStatus(site.id, 'Hata Oluştu');
    }
}

async function takeSmartScreenshot(id, url) {
    let browser;
    try {
        const site = await db('sites').where({ id }).first();
        const screenshotName = `site-${id}-${Date.now()}.png`;
        const screenshotPath = path.join(__dirname, '../public/screenshots', screenshotName);

        const dir = path.join(__dirname, '../public/screenshots');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        browser = await puppeteer.launch({
            executablePath: EXECUTABLE_PATH,
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900 });
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

        if (site.requires_login) await performSmartLogin(page, site, id);

        await delay(2000); // Dinamik içeriklerin yüklenmesi için bekleme
        await page.screenshot({ path: screenshotPath });

        await db('sites').where({ id }).update({
            screenshot_path: `/screenshots/${screenshotName}`,
            status: 'Tamamlandı'
        });
    } catch (error) {
        console.error("Önizleme hatası:", error.message);
        await updateStatus(id, 'Önizleme Alınamadı');
    } finally {
        if (browser) await browser.close();
    }
}

module.exports = router;