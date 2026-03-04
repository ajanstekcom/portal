const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY || '', 'hex');
const IV_LENGTH = 16;

function encrypt(text) {
    if (!text) return null;
    if (ENCRYPTION_KEY.length !== 32) {
        throw new Error('ENCRYPTION_KEY must be a 32-byte hex string');
    }

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    if (!text) return null;
    // Eğer format mühürlü değilse (iki nokta araması) direkt metni döndür (Eski şifreler için)
    if (!text.includes(':')) return text;

    try {
        const textParts = text.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (error) {
        // Hata durumunda (eski şifre veya hatalı anahtar) metni olduğu gibi döndür
        console.error('Bilinmeyen format veya çözme hatası, düz metin kullanılıyor.');
        return text;
    }
}

module.exports = { encrypt, decrypt };
