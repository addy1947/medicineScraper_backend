// Load environment variables early
require('dotenv').config();

// Express backend to accept keyword and launch Apollo Pharmacy search
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
const { launchApolloSearch, capturePharmEasyTypeaheadFromPage, captureNetmedsProducts, fetchAndSave1mgSearchHTML, captureTruemedsProducts } = require('./tools');

// Utility: wrap a promise with a timeout so the API doesn't hang forever
function withTimeout(promise, ms, label = 'task') {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            const err = new Error(`${label} timed out after ${ms}ms`);
            err.code = 'ETIMEDOUT';
            reject(err);
        }, ms);
        promise
            .then((v) => { clearTimeout(timer); resolve(v); })
            .catch((e) => { clearTimeout(timer); reject(e); });
    });
}

const app = express();
const PORT = process.env.PORT;
const FRONTEND_URL = process.env.FRONTEND_URL ;

// Increase JSON body size limit for base64 images
app.use(bodyParser.json({ limit: '12mb' }));
// Allow local dev origins and production frontend
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin like mobile apps or curl
        if (!origin) return callback(null, true);
        // Allow localhost for development
        const isLocalhost = /^http:\/\/localhost:\d+$/i.test(origin);
        // Allow production frontend URL
        const isProduction = FRONTEND_URL && origin === FRONTEND_URL;
        // Allow any vercel.app domain
        const isVercel = /^https:\/\/.*\.vercel\.app$/i.test(origin);
        callback(null, isLocalhost || isProduction || isVercel);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// Health check
app.get('/api/health', (req, res) => {
    res.status(200).json({ ok: true, env: process.env.NODE_ENV || 'development' });
});

app.post('/api/apollo-search', async (req, res) => {
    const { keyword, enabledScrapers: enabledFromClient } = req.body || {};
    const enabled = {
        apollo: true,
        pharmeasy: true,
        netmeds: true,
        onemg: true,
        truemeds: true,
        ...(enabledFromClient || {})
    };

    console.log(`Received search for "${keyword}" with scrapers: ${Object.entries(enabled).filter(([,v])=>v).map(([k])=>k).join(', ') || 'none'}`);

    try {
        // Build tasks conditionally
        const entries = [];
        if (enabled.apollo) entries.push(['apollo', withTimeout(launchApolloSearch(keyword), 20000, 'apollo')]);
        if (enabled.pharmeasy) entries.push(['pharmeasy', withTimeout(capturePharmEasyTypeaheadFromPage(keyword), 20000, 'pharmeasy')]);
        if (enabled.netmeds) entries.push(['netmeds', withTimeout(captureNetmedsProducts(keyword), 55000, 'netmeds')]);
        if (enabled.onemg) entries.push(['onemg', withTimeout(fetchAndSave1mgSearchHTML(keyword), 20000, '1mg')]);
        if (enabled.truemeds) entries.push(['truemeds', withTimeout(captureTruemedsProducts(keyword), 50000, 'truemeds')]);

        const settled = await Promise.allSettled(entries.map((e) => e[1]));
        const map = {};
        entries.forEach((e, i) => { map[e[0]] = settled[i]; });

        // Compose payload only for enabled scrapers
        let payload = { success: true };

        if (enabled.apollo) {
            const apolloRes = map.apollo;
            payload.data = apolloRes?.status === 'fulfilled' ? apolloRes.value : null;
            payload.apolloError = apolloRes?.status === 'rejected' ? apolloRes.reason?.message : null;
        }

        if (enabled.pharmeasy) {
            const r = map.pharmeasy;
            payload.pharmeasy = r?.status === 'fulfilled' ? r.value : { ok: false, error: r?.reason?.message };
        }

        if (enabled.netmeds) {
            const r = map.netmeds;
            payload.netmeds = r?.status === 'fulfilled' ? r.value : { ok: false, error: r?.reason?.message };
        }

        if (enabled.onemg) {
            const r = map.onemg;
            payload.onemg = r?.status === 'fulfilled' ? r.value : { ok: false, error: r?.reason?.message };
            if (payload.onemg?.ok) {
                console.log(`1mg: Returned ${payload.onemg.productsCount} products (top 3)`);
            }
        }

        if (enabled.truemeds) {
            const r = map.truemeds;
            payload.truemeds = r?.status === 'fulfilled' ? r.value : { ok: false, error: r?.reason?.message };
            if (payload.truemeds?.ok) {
                console.log(`Truemeds: ${payload.truemeds.message} - ${payload.truemeds.filePath}`);
                console.log(`Truemeds: Sending ${payload.truemeds.productsCount} products to frontend`);
            } else if (payload.truemeds?.error) {
                console.log(`Truemeds error: ${payload.truemeds.error}`);
            }
        }

        res.status(200).json(payload);
    } catch (error) {
        res.status(400).json({ 
            success: false,
            error: error.message 
        });
    }
});

// Save PharmEasy typeahead response to a JSON file and return the file path
app.post('/api/pharmeasy-typeahead', async (req, res) => {
    const { keyword } = req.body;
    try {
        const result = await capturePharmEasyTypeaheadFromPage(keyword);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * OCR + extraction route: Accepts base64 image and returns extracted medicine names.
 * Expected body: { imageBase64: 'data:image/png;base64,iVBORw0...', mimeType?: 'image/png' }
 */
app.post('/api/ocr-prescription', async (req, res) => {
    const { imageBase64, mimeType } = req.body || {};
    if (!imageBase64 || typeof imageBase64 !== 'string') {
        return res.status(400).json({ success: false, error: 'imageBase64 is required' });
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ success: false, error: 'Gemini API key not configured' });
    }

    // Strip possible prefix like data:image/png;base64,
    const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, '');

    // Prompt to guide Gemini to return only medicine names
    const prompt = `You are an OCR assistant for medical prescriptions. From the following prescription image, extract ONLY the distinct medicine names. \nDo NOT include dosage, frequency, instructions, patient name, or doctor name.\nReturn the result as a JSON array of strings, like: ["Paracetamol","Azithromycin"]\nIf no medicines can be confidently extracted, return an empty array [] and nothing else.`;

    try {
        // Gemini API - using the generative model with image input
        // Endpoint pattern may vary; adjust if needed for chosen Gemini API variant.
    // Switched model to Gemini 2.5 (multimodal) as requested
    const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
        const payload = {
            contents: [
                {
                    parts: [
                        { text: prompt },
                        {
                            inlineData: {
                                mimeType: mimeType || 'image/png',
                                data: base64Data,
                            }
                        }
                    ]
                }
            ]
        };

        const { data } = await axios.post(`${geminiUrl}?key=${apiKey}`, payload, {
            headers: { 'Content-Type': 'application/json' }
        });

        // Safely parse model output
        let textOut = '';
        try {
            textOut = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } catch (_) {}

        let medicines = [];
        if (textOut) {
            // Clean up markdown code blocks if present (```json ... ```)
            let cleanText = textOut.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
            
            // Attempt direct JSON parse first
            try {
                medicines = JSON.parse(cleanText);
                if (!Array.isArray(medicines)) medicines = [];
                medicines = medicines.filter(x => typeof x === 'string').map(s => s.trim()).filter(Boolean);
            } catch (e) {
                // Fallback: extract from array-like string or split by lines
                // Handle cases like ["med1","med2"] or just med1, med2
                let extracted = cleanText
                    .replace(/^\[|\]$/g, '') // remove outer brackets
                    .split(/[,\n]/) // split by comma or newline
                    .map(s => s.replace(/^["'\s]+|["'\s]+$/g, '').trim()) // remove quotes and whitespace
                    .filter(Boolean)
                    .filter(s => /[a-zA-Z]/.test(s) && s.length > 1)
                    .slice(0, 20);
                medicines = extracted;
            }
        }
        // Deduplicate and clean
        medicines = Array.from(new Set(medicines.map(m => {
            // Remove any remaining quotes, brackets, or json artifacts
            return m.replace(/^["'\[\]]+|["'\[\]]+$/g, '').trim();
        }))).filter(Boolean);

        return res.status(200).json({ success: true, medicines });
    } catch (err) {
        console.error('Gemini OCR error:', err.message);
        return res.status(500).json({ success: false, error: 'Failed to process image' });
    }
});

app.listen(PORT, () => {
    console.log(`Backend server running on port ${PORT}`);
});
