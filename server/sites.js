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
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'supersecretkey123');
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

router.use(authenticate);

// --- SABİTLER ---
const EXECUTABLE_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const delay = (ms) => new Promise(res => setTimeout(res, ms));

// --- YARDIMCI FONKSİYONLAR ---
async function updateStatus(id, status) {
    try {
        await db('sites').where({ id }).update({ status });
    } catch (e) {
        console.error("DB Güncelleme Hatası:", e.message);
    }
}

async function performSmartLogin(page, site, id = null) {
    if (id) await updateStatus(id, 'Giriş deneniyor...');

    try {
        // Formun yüklenmesi için kısa bir bekleme
        await delay(1000);

        const userSelectors = ['input[type="text"]', 'input[type="email"]', 'input[name*="user" i]', 'input[id*="user" i]'];
        const passSelectors = ['input[type="password"]', 'input[name*="pass" i]', 'input[id*="id" i]'];

        let userEl, passEl;
        for (const s of userSelectors) { if (userEl = await page.$(s)) break; }
        for (const s of passSelectors) { if (passEl = await page.$(s)) break; }

        // Eğer direkt form yoksa "Admin Girişi" butonuna basmayı dene (Görseldeki gibi)
        if (!userEl && !passEl) {
            const loginBtn = await page.$('button::-p-text(Admin Girişi)') || await page.$('a::-p-text(Admin Girişi)');
            if (loginBtn) {
                await loginBtn.click();
                await delay(1500);
                for (const s of userSelectors) { if (userEl = await page.$(s)) break; }
                for (const s of passSelectors) { if (passEl = await page.$(s)) break; }
            }
        }

        if (userEl && passEl) {
            await userEl.click({ clickCount: 3 });
            await page.keyboard.press('Backspace');
            await userEl.type(site.site_username, { delay: 30 });

            await passEl.click({ clickCount: 3 });
            await page.keyboard.press('Backspace');

            // Şifreyi burada çözüp tarayıcıya yazıyoruz
            const decryptedPassword = decrypt(site.site_password);
            await passEl.type(decryptedPassword || '', { delay: 30 });

            await page.keyboard.press('Enter');
            // Giriş sonrası sayfanın oturum açmasını bekle
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => { });
        }
    } catch (err) {
        console.log("Login adımı atlandı veya hata oluştu:", err.message);
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
    let browser;
    const port = 9100 + (parseInt(site.id) % 500);
    // Artık sistem geçici klasörünü kullanıyoruz, böylece proje klasörü şişmiyor.
    const profilePath = path.join(os.tmpdir(), `portal-site-${site.id}-${Date.now()}`);

    try {
        // Önce çalışan bir instance var mı kontrol et
        browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, defaultViewport: null });
    } catch (e) {
        // Yoksa yeni aç
        browser = await puppeteer.launch({
            executablePath: EXECUTABLE_PATH,
            headless: false,
            userDataDir: profilePath,
            defaultViewport: null,
            ignoreDefaultArgs: ['--enable-automation'], // Otomasyon uyarısını bir miktar azaltır
            args: [
                '--start-maximized',
                `--remote-debugging-port=${port}`,
                '--no-first-run',
                '--no-default-browser-check',
                '--new-window' // Her siteyi yeni pencerede açmaya zorlar
            ]
        });
    }

    const pages = await browser.pages();
    let page = pages.find(p => p.url().includes(site.url)) || (pages.length > 0 ? pages[0] : await browser.newPage());

    await page.bringToFront();

    // Sayfa boşsa veya yanlış yerdeyse yönlendir
    if (page.url() === 'about:blank' || !page.url().includes(site.url)) {
        await page.goto(site.url, { waitUntil: 'networkidle2', timeout: 60000 });
    }

    if (site.requires_login) {
        await performSmartLogin(page, site);
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
            args: ['--no-sandbox', '--disable-setuid-sandbox']
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