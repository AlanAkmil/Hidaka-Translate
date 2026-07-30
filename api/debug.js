import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import crypto from 'crypto';

// ============ KONFIGURASI REAL ============
const SCAN_TRANSLATOR_API = 'https://scan-translator.com/api/translate';
const SCAN_TRANSLATOR_UPLOAD = 'https://scan-translator.com/api/upload';

// ============ CACHE SYSTEM (REAL) ============
const cache = new Map();

function generateImageHash(buffer) {
    return crypto.createHash('md5').update(buffer).digest('hex');
}

// ============ AKUN ROTASI (REAL) ============
// Ini bakal generate akun pake temp mail + register ke scan-translator
const accounts = [];
const TEMP_EMAIL_API = 'https://api.mail.tm';

async function createTempEmail() {
    const res = await fetch(`${TEMP_EMAIL_API}/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            address: `user${Date.now()}@mail.tm`,
            password: 'password123'
        })
    });
    const data = await res.json();
    return data;
}

async function registerAccount(email, password) {
    const res = await fetch('https://scan-translator.com/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    return await res.json();
}

async function getFreeCredits(account) {
    // Login dulu
    const login = await fetch('https://scan-translator.com/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: account.email,
            password: account.password
        })
    });
    const data = await login.json();
    return data.credits || 0;
}

async function rotateAccount() {
    if (accounts.length > 0) {
        return accounts.pop();
    }
    // Buat akun baru
    const email = await createTempEmail();
    await registerAccount(email.address, email.password);
    const credits = await getFreeCredits(email);
    accounts.push({ ...email, credits });
    return accounts.pop();
}

// ============ MAIN HANDLER ============
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    try {
        // Ambil file dari form-data
        const formData = await req.formData();
        const image = formData.get('image');
        const sourceLang = formData.get('source') || 'ko';
        const targetLang = formData.get('target') || 'id';
        const mode = formData.get('mode') || 'auto';

        if (!image) {
            return res.status(400).json({ success: false, message: 'No image uploaded' });
        }

        // Baca buffer
        const buffer = Buffer.from(await image.arrayBuffer());
        const imageHash = generateImageHash(buffer);
        const cacheKey = `${imageHash}:${targetLang}`;

        // ============ 1. Cek Cache (GRATIS) ============
        if (cache.has(cacheKey) && mode !== 'force') {
            return res.status(200).json({
                success: true,
                text: cache.get(cacheKey),
                creditUsed: 0,
                cacheHit: true,
                message: 'CACHE HIT — Kredit aman!'
            });
        }

        // ============ 2. Coba Translate Pake Akun Yang Ada ============
        let account = null;
        let creditUsed = 0;
        let resultText = '';

        // Coba pake akun yang udah ada (max 5 attempt)
        for (let attempt = 0; attempt < 5; attempt++) {
            account = await rotateAccount();
            if (!account) break;

            // Cek sisa kredit akun
            const credits = await getFreeCredits(account);
            if (credits <= 0) {
                continue; // Akun habis, coba yang lain
            }

            // Kirim request ke scan-translator API
            const form = new FormData();
            form.append('image', buffer, {
                filename: 'panel.jpg',
                contentType: 'image/jpeg'
            });
            form.append('source', sourceLang);
            form.append('target', targetLang);
            form.append('apiKey', account.apiKey || 'free');

            const translateRes = await fetch(SCAN_TRANSLATOR_API, {
                method: 'POST',
                headers: {
                    ...form.getHeaders(),
                    'Authorization': `Bearer ${account.token || ''}`
                },
                body: form
            });

            const translateData = await translateRes.json();

            if (translateRes.ok && translateData.text) {
                creditUsed = 1;
                resultText = translateData.text;
                break;
            } else {
                // Akun error, discard
                continue;
            }
        }

        // ============ 3. Kalo Gagal, Pake Unlimited Plan (Slow Lane) ============
        if (!resultText) {
            // Pake endpoint public tanpa auth — slow lane
            const form = new FormData();
            form.append('image', buffer, {
                filename: 'panel.jpg',
                contentType: 'image/jpeg'
            });
            form.append('source', sourceLang);
            form.append('target', targetLang);
            form.append('mode', 'slow'); // Kunci: slow lane = unlimited

            const slowRes = await fetch(SCAN_TRANSLATOR_API, {
                method: 'POST',
                headers: form.getHeaders(),
                body: form
            });

            const slowData = await slowRes.json();

            if (slowRes.ok && slowData.text) {
                creditUsed = 0;
                resultText = slowData.text;
            } else {
                throw new Error('Gagal translate: ' + (slowData.message || 'Unknown error'));
            }
        }

        // ============ 4. Simpan Cache ============
        if (resultText) {
            cache.set(cacheKey, resultText);
        }

        return res.status(200).json({
            success: true,
            text: resultText,
            creditUsed: creditUsed,
            cacheHit: false,
            message: creditUsed > 0 ? 'Kredit terpakai 1' : 'Gratis — Slow lane / Cache'
        });

    } catch (err) {
        console.error('Debug error:', err);
        return res.status(500).json({
            success: false,
            message: err.message || 'Internal server error'
        });
    }
}