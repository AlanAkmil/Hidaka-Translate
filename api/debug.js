export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    try {
        // Simulasi translate — di production pake OCR + Google Translate/DeepL
        const mockTranslations = [
            'Ini adalah terjemahan dari panel manwha.',
            'Karakter utama bertarung melawan musuh kuat.',
            'Dia menemukan kekuatan baru yang tersembunyi.',
            'Aku tidak akan menyerah sampai akhir!',
            'Sahabatnya datang untuk menyelamatkan.',
            'Mereka merencanakan serangan balik.',
            'Rahasia kuno terungkap.',
            'Dia sadar akan takdirnya.',
            'Perjalanan panjang dimulai di sini.',
            'Kemenangan terasa sangat dekat.',
            'Bayangan gelap mulai menyelimuti.',
            'Cahaya harapan muncul di kejauhan.',
        ];

        const randomText = mockTranslations[Math.floor(Math.random() * mockTranslations.length)];

        // Simulasi credit usage — cache exploit
        const creditUsed = Math.random() > 0.7 ? 1 : 0; // 70% chance free
        const isCache = creditUsed === 0;

        return res.status(200).json({
            success: true,
            text: randomText,
            creditUsed: creditUsed,
            isCache: isCache,
            message: isCache ? 'CACHE HIT — Gratis!' : 'Kredit terpakai 1'
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
}