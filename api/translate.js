/**
 * @project : Hidaka Translate - Backend API
 * @route   : POST /api/translate
 * @body    : { imageBase64, mimeType, targetLang }
 * @returns : { bubbles: [{xPct,yPct,wPct,hPct,original,translated}] }
 *
 * SETUP VERCEL:
 * Environment Variables:
 *   GROQ_API_KEY = gsk_xxxxxxxxxxxx
 */

const GROQ_VISION_URL = 'https://api.groq.com/openai/v1/chat/completions';
const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY belum diset' });

  const { imageBase64, mimeType = 'image/jpeg', targetLang = 'Indonesian' } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 diperlukan' });

  const prompt = `You are an expert manga/comic OCR and translation AI.

Analyze this manga/comic image carefully. Detect ALL text bubbles, speech bubbles, thought bubbles, sound effects, and any text overlays.

For EACH text element found:
1. Estimate its bounding box as percentage of total image dimensions (0-100)
2. Extract the EXACT original text
3. Translate it naturally to: ${targetLang}

IMPORTANT RULES:
- Sound effects (SFX): translate/adapt them naturally (e.g. "ドン" → "DUAR!", "BOOM!")
- Keep the tone and emotion of the original
- For speech bubbles: preserve the character's speaking style
- xPct/yPct = top-left corner of the bubble
- wPct/hPct = width/height of the bubble

Respond ONLY with a valid JSON array. No markdown, no explanation, just the raw JSON:
[
  {
    "xPct": 10.5,
    "yPct": 5.2,
    "wPct": 28.0,
    "hPct": 12.5,
    "original": "original text",
    "translated": "translated text in ${targetLang}"
  }
]

If no text found, return exactly: []`;

  try {
    const response = await fetch(GROQ_VISION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${imageBase64}`
                }
              },
              {
                type: 'text',
                text: prompt
              }
            ]
          }
        ],
        temperature: 0.3,
        max_tokens: 4096
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message || `Groq error ${response.status}`);
    }

    let content = data?.choices?.[0]?.message?.content || '';

    // Strip markdown fences
    content = content.replace(/```json\n?/gi, '').replace(/```\n?/gi, '').trim();

    // Extract JSON array
    const match = content.match(/\[[\s\S]*\]/);
    if (!match) {
      // Kalau AI bilang tidak ada teks
      if (content.includes('[]') || content.toLowerCase().includes('no text')) {
        return res.status(200).json({ bubbles: [], message: 'Tidak ada teks terdeteksi' });
      }
      throw new Error('Format respons AI tidak valid');
    }

    const bubbles = JSON.parse(match[0]);

    // Validasi & sanitasi
    const cleaned = bubbles
      .filter(b => b.original && b.translated)
      .map(b => ({
        xPct: Math.max(0, Math.min(100, parseFloat(b.xPct) || 0)),
        yPct: Math.max(0, Math.min(100, parseFloat(b.yPct) || 0)),
        wPct: Math.max(1, Math.min(100, parseFloat(b.wPct) || 20)),
        hPct: Math.max(1, Math.min(100, parseFloat(b.hPct) || 10)),
        original: String(b.original).trim(),
        translated: String(b.translated).trim()
      }));

    return res.status(200).json({ bubbles: cleaned });

  } catch (err) {
    console.error('Translate error:', err);
    return res.status(500).json({ error: err.message || 'Terjemahan gagal' });
  }
}
