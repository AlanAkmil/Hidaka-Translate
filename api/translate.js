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

  const prompt = `You are an expert manga/comic OCR and translation AI. Your job is to find EVERY speech bubble and text area in this manga page, then translate them.

TASK:
1. Find ALL speech bubbles, thought bubbles, caption boxes, and sound effects
2. For each one, give the EXACT bounding box as % of image size (top-left corner + width + height)
3. Extract the original text exactly as written
4. Translate naturally to: ${targetLang}

BOUNDING BOX RULES (very important):
- xPct, yPct = top-left corner of the WHITE BUBBLE AREA (not the character, the bubble itself)
- wPct = width of the bubble
- hPct = height of the bubble
- Be generous with the bounding box — make it slightly larger than the text area
- Values must be 0-100

TRANSLATION RULES:
- Keep natural spoken language, preserve emotion and tone
- Sound effects: adapt naturally (e.g. "ドン" → "DANG!", "ざわざわ" → "RAMAI...")
- Thought bubbles: keep inner monologue style
- DO NOT translate onomatopoeia literally, make it feel natural in ${targetLang}

OUTPUT FORMAT — respond ONLY with raw JSON array, zero other text:
[{"xPct":5.0,"yPct":3.0,"wPct":25.0,"hPct":18.0,"original":"original text here","translated":"${targetLang} translation here"}]

If truly no text exists: []`;

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
