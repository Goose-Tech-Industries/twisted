// =================================================================
// AI HELPERS — Shared utility for all AI-powered features
// =================================================================
// Every AI feature calls callAIHelper() which:
//   1. Checks if the feature is enabled via system_settings
//   2. Loads the AI config (provider, key, model)
//   3. Calls the appropriate provider (Claude, Gemini, OpenAI, Ollama)
//   4. Returns the text response
//
// Usage:
//   const { callAIHelper, isAIEnabled } = require('./ai-helpers');
//   if (await isAIEnabled(db, 'ai_battle_narration')) {
//     const text = await callAIHelper(db, prompt, { maxTokens: 150 });
//   }
// =================================================================

const { loadAiConfig } = require('./state');

// Cache settings for 60s
let _settingsCache = {};
let _settingsCacheAt = 0;

async function loadAISettings(db) {
    const now = Date.now();
    if (now - _settingsCacheAt < 60000 && Object.keys(_settingsCache).length) return _settingsCache;
    try {
        const [rows] = await db.query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE 'ai_%'");
        const map = {};
        for (const r of rows) map[r.setting_key] = r.setting_value;
        _settingsCache = map;
        _settingsCacheAt = now;
        return map;
    } catch { return _settingsCache; }
}

async function isAIEnabled(db, featureKey) {
    const settings = await loadAISettings(db);
    const providerSet = settings.ai_provider && settings.ai_provider !== 'disabled';
    const featureOn = settings[featureKey] === 'true' || settings[featureKey] === '1';
    return providerSet && featureOn;
}

async function callAIHelper(db, prompt, opts = {}) {
    const config = await loadAiConfig(db);
    if (!config || !config.provider) return null;

    const maxTokens = opts.maxTokens || config.maxTokens || 256;
    const temperature = opts.temperature ?? config.temperature ?? 0.85;
    const provider = config.provider;
    const apiKey = config.apiKey;
    const model = config.model;

    try {
        if (provider === 'anthropic') {
            const res = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: model || 'claude-haiku-4-5-20251001',
                    max_tokens: maxTokens,
                    temperature,
                    messages: [{ role: 'user', content: prompt }]
                })
            });
            if (!res.ok) return null;
            const json = await res.json();
            return json?.content?.[0]?.text?.trim() || null;
        }

        if (provider === 'gemini') {
            const m = model || 'gemini-2.0-flash';
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature, maxOutputTokens: maxTokens }
                })
            });
            if (!res.ok) return null;
            const json = await res.json();
            return json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
        }

        if (provider === 'openai') {
            const baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
            const res = await fetch(baseUrl + '/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: model || 'gpt-4o-mini',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: maxTokens, temperature
                })
            });
            if (!res.ok) return null;
            const json = await res.json();
            return json?.choices?.[0]?.message?.content?.trim() || null;
        }

        if (provider === 'ollama' && config.baseUrl) {
            const res = await fetch(config.baseUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: model || 'llama3', prompt, stream: false })
            });
            if (!res.ok) return null;
            const json = await res.json();
            return (json.response || json.text || '').trim() || null;
        }
    } catch (e) {
        console.warn('[AI Helper] Error:', e.message);
        return null;
    }
    return null;
}

// Invalidate settings cache (called when admin changes settings)
function invalidateAICache() {
    _settingsCacheAt = 0;
    _settingsCache = {};
}

module.exports = { callAIHelper, isAIEnabled, loadAISettings, invalidateAICache };
