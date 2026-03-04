require('dotenv').config();
const { decrypt, encrypt } = require('./utils/crypto');

console.log('--- Geriye Dönük Uyumluluk Testi ---');

const legacyPass = 'EskiSifre123';
console.log('Eski Şifre (Düz Metin):', legacyPass);

const result = decrypt(legacyPass);
console.log('Çözme Sonucu:', result);

if (result === legacyPass) {
    console.log('✅ BAŞARILI: Eski şifre bozulmadan okundu.');
} else {
    console.log('❌ HATA: Eski şifre yanlış çözüldü!');
}

const newPass = 'YeniSifre456';
const encrypted = encrypt(newPass);
const decrypted = decrypt(encrypted);

if (decrypted === newPass) {
    console.log('✅ BAŞARILI: Yeni şifreleme ve çözme düzgün çalışıyor.');
} else {
    console.log('❌ HATA: Yeni şifreleme sisteminde hata var!');
}

console.log('--- Test Bitti ---');
