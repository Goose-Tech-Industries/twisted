// =================================================================
// NPC BRAIN v3 — Multi-provider AI with rule-based fallback
// =================================================================
// Provider priority (DB config wins over .env):
//   1. DB setting: ai_provider (gemini | anthropic | openai | ollama | disabled)
//   2. .env fallback: GEMINI_API_KEY → gemini, NPC_LLM_URL → ollama
//   3. Rule-based keyword replies — always works, zero config
//
// To configure: AdminSauce → Settings → 🤖 AI Brain
// Keys are stored in system_settings. The server passes them in as
// aiConfig so this file never touches the DB directly.
// =================================================================

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function containsAny(s, words) { return words.some(w => s.toLowerCase().includes(w)); }

// -----------------------------------------------------------------
// GEMINI CALLER
// -----------------------------------------------------------------
async function callGemini(prompt, apiKey, model, temperature, maxTokens) {
    if (!apiKey) throw new Error('No Gemini API key configured');
    const m   = model || 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature:     temperature ?? 0.85,
                maxOutputTokens: maxTokens   ?? 256,
                stopSequences:   ['\nPLAYER:', '\n---']
            },
            safetySettings: [
                { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
            ]
        })
    });

    if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After') || '60';
        throw Object.assign(
            new Error(`Gemini rate limit (429). Retry after ${retryAfter}s.`),
            { isRateLimit: true, retryAfter: parseInt(retryAfter) }
        );
    }
    if (!res.ok) {
        const err = await res.text().catch(() => '');
        throw new Error(`Gemini HTTP ${res.status}: ${err.slice(0, 120)}`);
    }
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini returned no text');
    return text.trim();
}

// -----------------------------------------------------------------
// ANTHROPIC (Claude) CALLER
// Uses the /v1/messages endpoint. Model default: claude-haiku (fast + cheap)
// -----------------------------------------------------------------
async function callAnthropic(prompt, apiKey, model, maxTokens, temperature) {
    if (!apiKey) throw new Error('No Anthropic API key configured');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type':    'application/json',
            'x-api-key':       apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model:      model || 'claude-haiku-4-5-20251001',
            max_tokens: maxTokens   ?? 256,
            messages:   [{ role: 'user', content: prompt }]
        })
    });
    if (!res.ok) {
        const err = await res.text().catch(() => '');
        throw new Error(`Anthropic HTTP ${res.status}: ${err.slice(0, 120)}`);
    }
    const json = await res.json();
    const text = json?.content?.[0]?.text;
    if (!text) throw new Error('Anthropic returned no text');
    return text.trim();
}

// -----------------------------------------------------------------
// OPENAI / OPENAI-COMPATIBLE CALLER
// Works with OpenAI, Groq, Together, LM Studio, anything OpenAI-shaped.
// Set ai_base_url to override the endpoint (e.g. http://localhost:1234/v1)
// -----------------------------------------------------------------
async function callOpenAI(prompt, apiKey, model, baseUrl, maxTokens, temperature) {
    const endpoint = (baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '') + '/chat/completions';
    const headers  = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model:      model || 'gpt-4o-mini',
            max_tokens: maxTokens   ?? 256,
            temperature: temperature ?? 0.85,
            messages:   [{ role: 'user', content: prompt }]
        })
    });
    if (!res.ok) {
        const err = await res.text().catch(() => '');
        throw new Error(`OpenAI HTTP ${res.status}: ${err.slice(0, 120)}`);
    }
    const json = await res.json();
    const text = json?.choices?.[0]?.message?.content;
    if (!text) throw new Error('OpenAI returned no text');
    return text.trim();
}

// -----------------------------------------------------------------
// OLLAMA CALLER (self-hosted local models)
// -----------------------------------------------------------------
async function callOllama(url, model, prompt) {
    if (!url) throw new Error('No Ollama URL configured');
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: false })
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const json = await res.json();
    return String(json.response || json.text || '').trim();
}

// -----------------------------------------------------------------
// PROMPT BUILDER
// Builds a rich context prompt from NPC persona, memory, world state.
// aiConfig.systemPrompt lets admins set the world tone from AdminSauce.
// -----------------------------------------------------------------
function buildPrompt({ npc, player, message, history, memory, worldFlags, region, aiConfig }) {
    const hist = (history || []).slice(-8)
        .map(h => (h.role === 'user' ? `PLAYER: ${h.text}` : `${npc.name.toUpperCase()}: ${h.text}`))
        .join('\n');

    const facts   = (memory?.facts?.length)
        ? `What you remember about ${player.name}:\n` + memory.facts.map(f => `  - ${f}`).join('\n')
        : '';
    const rep     = memory?.reputation || 0;
    const repTone = rep > 50  ? 'You respect and like this player. Be warm and generous with information.'
                  : rep < -30 ? 'You distrust this player deeply. Be cold, guarded, or openly hostile.'
                  :             'You are neutral toward this player. Cautious but not unfriendly.';

    const worldKnowledge = worldFlags && Object.keys(worldFlags).length
        ? 'World events you are aware of:\n' +
          Object.entries(worldFlags)
              .filter(([, v]) => v === 'true' || v === '1')
              .map(([k]) => `  - ${k.replace(/_/g, ' ')}`)
              .join('\n')
        : '';

    let regionContext = '';
    if (region) {
        const parts = [];
        if (region.danger_level >= 3) parts.push(`This region is dangerous (danger ${region.danger_level}/5). People are on edge.`);
        if (region.corruption_level >= 2) parts.push(`Dark corruption lingers here (level ${region.corruption_level}/5). The air feels wrong.`);
        if (region.faction_control) parts.push(`The ${region.faction_control} hold sway in this area.`);
        if (region.weather_override && region.weather_override !== 'CLEAR') {
            const wx = { RAIN:'Rain is falling steadily.', STORM:'A fierce storm rages.', FOG:'Thick fog rolls through.',
                BLIZZARD:'A blizzard howls.', BLOOD_MOON:'A blood moon hangs in the sky. Something stirs.' };
            if (wx[region.weather_override]) parts.push(wx[region.weather_override]);
        }
        try {
            const tags = typeof region.active_tags_json === 'string'
                ? JSON.parse(region.active_tags_json) : (region.active_tags_json || []);
            if (tags.includes('siege'))        parts.push('The region is under siege.');
            if (tags.includes('famine'))       parts.push('Famine grips the land.');
            if (tags.includes('undead_surge')) parts.push('The dead walk in numbers tonight.');
            if (tags.includes('festival'))     parts.push('A festival is in full swing nearby.');
        } catch {}
        if (parts.length) regionContext = 'Local conditions:\n' + parts.map(p => `  - ${p}`).join('\n');
    }

    const address   = player.title ? `${player.name} ${player.title}` : player.name;
    const playerCtx = [
        player.level      ? `level ${player.level}` : null,
        player.title      ? `known as "${player.title}"` : null,
        player.questsDone > 0 ? `${player.questsDone} quest(s) completed` : null
    ].filter(Boolean).join(', ');

    const moodLine = npc.mood
        ? `You are currently feeling ${npc.mood}. Let that colour your tone naturally — don't announce it.`
        : null;

    // TEACHING: The admin's custom system prompt from AdminSauce replaces the
    // hardcoded "dark Celtic fantasy world" description, so the game master can
    // set any world tone they want without touching this file.
    const worldDesc = (aiConfig?.systemPrompt || '').trim()
        || 'a dark Celtic fantasy world. Dark, grounded tone. Celtic gothic. Weary, not cheerful.';

    return [
        `You are ${npc.name}, a character in ${worldDesc}`,
        `Your persona: ${npc.persona || 'A weathered inhabitant of this world.'}`,
        `You are speaking to ${address}${playerCtx ? ` (${playerCtx})` : ''}.`,
        moodLine,
        repTone,
        facts          || null,
        worldKnowledge || null,
        regionContext  || null,
        `Rules:`,
        `- Reply as ${npc.name} ONLY. 1-3 short sentences maximum.`,
        `- Stay completely in character. No meta-commentary, no disclaimers.`,
        `- Do NOT start your reply with your own name.`,
        ``,
        hist ? `Conversation so far:\n${hist}\n` : ``,
        `PLAYER: ${message}`,
        `${npc.name.toUpperCase()}:`
    ].filter(v => v !== null).join('\n');
}

// -----------------------------------------------------------------
// MAIN ENTRY POINT
// aiConfig is loaded by server.js from system_settings (DB) and passed
// in here. Falls back to .env if not provided, for backward compat.
// -----------------------------------------------------------------
async function getNpcReply({ npc, player, message, history, memory, worldFlags, region, aiConfig }) {
    const prompt = buildPrompt({ npc, player, message, history, memory, worldFlags, region, aiConfig });

    // Resolve provider: DB config → env vars → disabled
    const provider   = aiConfig?.provider   || (process.env.GEMINI_API_KEY ? 'gemini' : process.env.NPC_LLM_URL ? 'ollama' : null);
    const apiKey     = aiConfig?.apiKey     || process.env.GEMINI_API_KEY || '';
    const model      = aiConfig?.model      || process.env.GEMINI_MODEL   || process.env.NPC_LLM_MODEL || '';
    const baseUrl    = aiConfig?.baseUrl    || process.env.NPC_LLM_URL    || '';
    const temperature = aiConfig?.temperature ?? 0.85;
    const maxTokens  = aiConfig?.maxTokens  ?? 256;

    if (provider === 'gemini') {
        try {
            const out = await callGemini(prompt, apiKey, model, temperature, maxTokens);
            if (out) return out;
        } catch (err) {
            if (err.isRateLimit) {
                console.warn(`[NPC Brain] Gemini rate-limited — falling back. Retry in ${err.retryAfter}s.`);
                global._geminiRateLimit = { at: Date.now(), retryAfter: err.retryAfter };
            } else {
                console.warn(`[NPC Brain] Gemini failed for ${npc.name}: ${err.message}`);
            }
        }
    }

    if (provider === 'anthropic') {
        try {
            const out = await callAnthropic(prompt, apiKey, model, maxTokens, temperature);
            if (out) return out;
        } catch (err) {
            console.warn(`[NPC Brain] Anthropic failed for ${npc.name}: ${err.message}`);
        }
    }

    if (provider === 'openai') {
        try {
            const out = await callOpenAI(prompt, apiKey, model, baseUrl, maxTokens, temperature);
            if (out) return out;
        } catch (err) {
            console.warn(`[NPC Brain] OpenAI failed for ${npc.name}: ${err.message}`);
        }
    }

    if (provider === 'ollama') {
        try {
            const ollamaModel = model || 'llama3';
            const out = await callOllama(baseUrl, ollamaModel, prompt);
            if (out) return out;
        } catch (err) {
            console.warn(`[NPC Brain] Ollama failed for ${npc.name}: ${err.message}`);
        }
    }

    // Rule-based fallback — always works, no AI needed
    return ruleBasedReply({ npc, message, memory });
}

// -----------------------------------------------------------------
// RULE-BASED FALLBACK — mood-aware, no AI required
// -----------------------------------------------------------------
function ruleBasedReply({ npc, message, memory }) {
    const s    = message.toLowerCase();
    const rep  = memory?.reputation || 0;
    const mood = npc.mood || null;

    if (rep < -50) return pick([
        `"I have nothing to say to you."`,
        `*${npc.name} turns away without a word.*`,
        `"Leave. Before I change my mind about being civil."`
    ]);

    if (mood === 'grieving') return pick([
        `"Not now. Please."`,
        `*${npc.name}'s eyes are red. They say nothing for a moment.* "...What do you need?"`,
        `"I'm sorry. I'm not… myself today."`
    ]);
    if (mood === 'fearful') return pick([
        `*${npc.name} glances over their shoulder.* "Keep your voice down."`,
        `"Something's wrong here. I can't explain it, but I feel it."`,
        `"You should leave this place. Both of us should."`
    ]);
    if (mood === 'angry') return pick([
        `"You picked a bad time."`,
        `*${npc.name} looks at you like a problem to be solved.* "Make it quick."`,
        `"Speak. But choose your words."`
    ]);
    if (mood === 'excited') return pick([
        `"You came at the right time! Something's happened—"`,
        `"I was hoping someone would pass through. Listen to this."`,
        `*${npc.name} leans in conspiratorially.* "You won't believe what I just heard."`
    ]);

    if (containsAny(s, ['help', 'danger', 'urgent', 'please', 'save']))
        return pick([`"Tell me what happened. Quickly."`, `"I'm listening. What's wrong?"`, `"Careful now. Start from the beginning."`]);
    if (containsAny(s, ['quest', 'job', 'task', 'mission', 'work']))
        return pick([`"There's always something that needs doing in a place like this."`, `"You want coin or you want purpose? Choose one."`, `"Ask around. The desperate ones always have work."`]);
    if (containsAny(s, ['who are you', 'name', 'what are you']))
        return pick([`"${npc.name}. That's all you need."`, `"I was something else once. Now I'm just ${npc.name}."`, `"Names cost nothing. Remembering them costs more."`]);
    if (containsAny(s, ['buy', 'sell', 'shop', 'trade', 'price', 'coin']))
        return pick([`"Got something worth trading? Let's see it."`, `"Everything has a price. The question is whether you can meet it."`, `"Coin first. Questions after."`]);
    if (containsAny(s, ['enemy', 'monster', 'creature', 'dangerous', 'kill', 'fight']))
        return pick([`"Stay on the road and you'll probably survive."`, `"The things out there don't care about your reasons for being here."`, `"Some of them used to be people. That should bother you more than it does."`]);
    if (containsAny(s, ['map', 'direction', 'where', 'road', 'path', 'north', 'south']))
        return pick([`"East road leads nowhere good. West is your best bet."`, `"I'd draw you a map but they change. The land remembers different things than we do."`, `"Follow the river. Don't stop when the water goes quiet."`]);
    if (containsAny(s, ['thanks', 'thank you', 'grateful', 'appreciate']))
        return rep > 30
            ? pick([`"Take care of yourself out there."`, `"You're one of the good ones. Don't prove me wrong."`, `"Come back if you need anything."`])
            : pick([`"Don't thank me yet."`, `"Save it. We'll see how this plays out."`, `"Mmm."`]);
    if (containsAny(s, ['bye', 'goodbye', 'leave', 'later', 'farewell']))
        return pick([`"Watch your back."`, `"Don't die. It's bad for the rest of us."`, `*${npc.name} nods once.* "Until next time."`]);
    if (containsAny(s, ['ogham', 'rune', 'blood', 'carved', 'groove']))
        return pick([`"Blood Oghams are not toys. Every debt they pay, they carve a new one."`, `"You've seen the grooves in blades? Each mark is a promise to something old."`, `"Those who carry them… change. Slowly. Then all at once."`]);

    return pick([
        `"Careful. That kind of talk gets people noticed."`,
        `"Maybe. Maybe not. Depends what you're willing to risk."`,
        `"Say what you mean, traveler. I don't have all night."`,
        `*${npc.name} studies you for a moment before answering.* "Ask a clearer question."`,
        `"There are things happening here that I won't name in the open."`
    ]);
}

// -----------------------------------------------------------------
// FACT EXTRACTION — learns about player from their messages
// -----------------------------------------------------------------
function extractFacts({ playerMessage, npcName, player, memory }) {
    const facts = (memory?.facts) ? [...memory.facts] : [];
    const msg   = playerMessage.toLowerCase();
    const addFact = (f) => { if (!facts.includes(f) && facts.length < 10) facts.push(f); };

    if (containsAny(msg, ['warrior', 'fighter', 'sword', 'shield']))  addFact('Appears to be a warrior type');
    if (containsAny(msg, ['mage', 'wizard', 'spell', 'magic']))       addFact('Appears to be a mage type');
    if (containsAny(msg, ['rogue', 'thief', 'sneak', 'steal']))       addFact('Appears to be a rogue type');
    if (containsAny(msg, ['quest', 'job', 'task', 'mission']))        addFact('Has asked about quests');
    if (containsAny(msg, ['buy', 'sell', 'shop', 'trade', 'price']))  addFact('Is interested in trading');
    if (containsAny(msg, ['thanks', 'thank you', 'grateful']))        addFact('Was polite and thankful');
    if (containsAny(msg, ['damn', 'fool', 'idiot', 'useless']))       addFact('Was rude');
    if (containsAny(msg, ['help', 'danger', 'urgent', 'please']))     addFact('Seemed to need urgent help');
    if (containsAny(msg, ['ogham', 'blood', 'carved', 'groove']))     addFact('Has asked about Blood Oghams');

    return facts;
}

// -----------------------------------------------------------------
// REPUTATION DELTA
// -----------------------------------------------------------------
function reputationDelta(playerMessage) {
    const msg = playerMessage.toLowerCase();
    if (containsAny(msg, ['thank', 'grateful', 'appreciate', 'well done', 'impressive']))
        return pick([3, 5, 4]);
    if (containsAny(msg, ['damn', 'fool', 'idiot', 'useless', 'worthless', 'pathetic']))
        return pick([-5, -8, -6]);
    if (containsAny(msg, ['help', 'please', 'need', 'urgent']))
        return 1;
    return 0;
}

module.exports = { getNpcReply, extractFacts, reputationDelta };
