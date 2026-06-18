// =================================================================
// AI FEATURES — All toggleable AI-powered game features
// =================================================================
// Each function checks its toggle setting before calling AI.
// Returns null if disabled or AI fails (callers handle gracefully).
// =================================================================

const { callAIHelper, isAIEnabled } = require('./ai-helpers');

// ─── BATTLE NARRATION ───────────────────────────────────────────
// Dramatic description of a combat action
async function narrateBattle(db, { attackerName, targetName, skillName, damage, isCrit, isKill }) {
    if (!await isAIEnabled(db, 'ai_battle_narration')) return null;
    const prompt = `Write a single dramatic sentence (under 25 words) narrating this RPG battle action. No quotes.
Attacker: ${attackerName}. Target: ${targetName}. Skill: ${skillName}. Damage: ${damage}.${isCrit ? ' CRITICAL HIT!' : ''}${isKill ? ' KILLING BLOW!' : ''}`;
    return callAIHelper(db, prompt, { maxTokens: 60, temperature: 0.9 });
}

// ─── QUEST GENERATION ───────────────────────────────────────────
// Generate a dynamic side quest
async function generateQuest(db, { playerLevel, mapName, regionName, worldTone }) {
    if (!await isAIEnabled(db, 'ai_quest_generation')) return null;
    const prompt = `Generate a short RPG side quest as JSON. Player level: ${playerLevel}. Location: ${mapName} (${regionName || 'unknown region'}). World tone: ${worldTone || 'dark fantasy'}.
Return ONLY valid JSON: {"name":"quest name","description":"1-2 sentences","objectives":[{"text":"objective description","type":"kill|collect|deliver|explore"}],"reward_gold":number,"reward_xp":number}`;
    const text = await callAIHelper(db, prompt, { maxTokens: 300, temperature: 0.8 });
    if (!text) return null;
    try { return JSON.parse(text.replace(/```json?|```/gi, '').trim()); } catch { return null; }
}

// ─── ITEM FLAVOR TEXT ───────────────────────────────────────────
// Generate description for an item
async function generateItemText(db, { itemName, itemType }) {
    if (!await isAIEnabled(db, 'ai_item_flavor_text')) return null;
    const prompt = `Write a short RPG item description (1-2 sentences, under 30 words) for: "${itemName}" (type: ${itemType}). Dark fantasy tone. No quotes around the response.`;
    return callAIHelper(db, prompt, { maxTokens: 60, temperature: 0.85 });
}

// ─── LORE BOOKS ─────────────────────────────────────────────────
// Generate a readable lore text
async function generateLore(db, { topic, worldTone, regionName }) {
    if (!await isAIEnabled(db, 'ai_lore_books')) return null;
    const prompt = `Write a short in-world lore passage (3-5 sentences) about "${topic}" for a ${worldTone || 'dark fantasy'} RPG set in ${regionName || 'a mysterious land'}. Written as if from an ancient text. No modern language.`;
    return callAIHelper(db, prompt, { maxTokens: 200, temperature: 0.9 });
}

// ─── REGION DESCRIPTIONS ────────────────────────────────────────
// Atmospheric text when entering a new area
async function describeRegion(db, { mapName, regionName, weather, timeOfDay, dangerLevel }) {
    if (!await isAIEnabled(db, 'ai_region_descriptions')) return null;
    const prompt = `Write a single atmospheric sentence (under 20 words) for entering "${mapName}" in ${regionName || 'unknown lands'}. Weather: ${weather || 'clear'}. Time: ${timeOfDay || 'day'}. Danger: ${dangerLevel || 'low'}. No quotes.`;
    return callAIHelper(db, prompt, { maxTokens: 40, temperature: 0.9 });
}

// ─── CHAT MODERATION ────────────────────────────────────────────
// Check if a chat message is toxic
async function moderateChat(db, { message, playerName }) {
    if (!await isAIEnabled(db, 'ai_chat_moderation')) return { safe: true };
    const prompt = `Is this chat message toxic, hateful, or inappropriate for an RPG game? Reply ONLY "safe" or "toxic". Message from ${playerName}: "${message}"`;
    const result = await callAIHelper(db, prompt, { maxTokens: 10, temperature: 0 });
    return { safe: !result || result.toLowerCase().includes('safe') };
}

// ─── NPC RUMORS ─────────────────────────────────────────────────
// Generate gossip based on world state
async function generateRumor(db, { npcName, mapName, recentEvents, worldTone }) {
    if (!await isAIEnabled(db, 'ai_npc_rumors')) return null;
    const prompt = `An NPC named "${npcName}" in "${mapName}" shares a rumor. World: ${worldTone || 'dark fantasy'}. Recent events: ${recentEvents || 'nothing notable'}. Write one short rumor sentence (under 25 words) in the NPC's voice. No quotes.`;
    return callAIHelper(db, prompt, { maxTokens: 50, temperature: 0.95 });
}

// ─── DEATH NARRATION ────────────────────────────────────────────
// Dramatic death/defeat text
async function narrateDeath(db, { playerName, killerName, location }) {
    if (!await isAIEnabled(db, 'ai_death_narration')) return null;
    const prompt = `Write a single dramatic sentence (under 20 words) about ${playerName} being defeated by ${killerName || 'the darkness'} in ${location || 'battle'}. Dark fantasy tone. No quotes.`;
    return callAIHelper(db, prompt, { maxTokens: 40, temperature: 0.9 });
}

// ─── COMPANION REACTIONS ────────────────────────────────────────
// Companion comments on events
async function companionReaction(db, { companionName, companionPersona, event }) {
    if (!await isAIEnabled(db, 'ai_companion_reactions')) return null;
    const prompt = `A companion named "${companionName}" (personality: ${companionPersona || 'loyal warrior'}) reacts to: "${event}". Write a single short sentence (under 15 words) in their voice. No quotes.`;
    return callAIHelper(db, prompt, { maxTokens: 30, temperature: 0.9 });
}

// ─── CRAFTING HINTS ─────────────────────────────────────────────
// Suggest what ingredients might create
async function craftingHint(db, { ingredients, worldTone }) {
    if (!await isAIEnabled(db, 'ai_crafting_hints')) return null;
    const names = ingredients.map(i => i.name || i).join(', ');
    const prompt = `In a ${worldTone || 'fantasy'} RPG, a player combines: ${names}. What might they create? Reply with ONLY the item name (2-4 words).`;
    return callAIHelper(db, prompt, { maxTokens: 20, temperature: 0.8 });
}

// ─── DYNAMIC WORLD EVENTS ───────────────────────────────────────
// AI decides what happens next in the world
async function generateWorldEvent(db, { worldTone, activeRegions, playerCount, currentEvents }) {
    if (!await isAIEnabled(db, 'ai_dynamic_world_events')) return null;
    const prompt = `Generate a world event for a ${worldTone || 'dark fantasy'} RPG. Active regions: ${activeRegions || 'various'}. Players online: ${playerCount || 1}. Current events: ${currentEvents || 'none'}.
Return ONLY valid JSON: {"name":"event name","description":"1 sentence","duration_minutes":number,"effects":{"xp_mult":number,"gold_mult":number}}`;
    const text = await callAIHelper(db, prompt, { maxTokens: 200, temperature: 0.85 });
    if (!text) return null;
    try { return JSON.parse(text.replace(/```json?|```/gi, '').trim()); } catch { return null; }
}

// ─── SMART ENEMY AI ─────────────────────────────────────────────
// AI picks battle tactics for an enemy
async function smartEnemyTactic(db, { enemyName, enemyHpPct, playerHpPct, availableSkills, battleContext }) {
    if (!await isAIEnabled(db, 'ai_smart_enemy_ai')) return null;
    const skills = availableSkills.map(s => s.name || s).join(', ');
    const prompt = `RPG battle AI. Enemy: ${enemyName} (HP: ${Math.round(enemyHpPct * 100)}%). Player HP: ${Math.round(playerHpPct * 100)}%. Available skills: ${skills}. Context: ${battleContext || 'normal fight'}.
Which skill should the enemy use? Reply with ONLY the skill name.`;
    return callAIHelper(db, prompt, { maxTokens: 20, temperature: 0.6 });
}

// ─── PLAYER BIOGRAPHY ───────────────────────────────────────────
// Generate a character's story from their history
async function generateBiography(db, { playerName, race, className, level, questsCompleted, kills, deaths, guildName }) {
    if (!await isAIEnabled(db, 'ai_player_biography')) return null;
    const prompt = `Write a short RPG character biography (3-4 sentences) for:
Name: ${playerName}, Race: ${race || 'Human'}, Class: ${className || 'Warrior'}, Level: ${level}.
Quests completed: ${questsCompleted || 0}. Battles won: ${kills || 0}. Deaths: ${deaths || 0}. Guild: ${guildName || 'none'}.
Write in third person, past tense, dark fantasy tone.`;
    return callAIHelper(db, prompt, { maxTokens: 200, temperature: 0.85 });
}

// ─── DM MODE — AI DUNGEON MASTER ────────────────────────────────
// Full AI DM for a party session
async function dmResponse(db, { dmContext, playerAction, partyMembers, location, sessionHistory, worldTone }) {
    if (!await isAIEnabled(db, 'ai_dm_mode')) return null;
    const party = (partyMembers || []).map(p => `${p.name} (${p.class}, Lv${p.level})`).join(', ');
    const history = (sessionHistory || []).slice(-10).map(h => `${h.speaker}: ${h.text}`).join('\n');
    const prompt = `You are a Dungeon Master running a ${worldTone || 'dark fantasy'} RPG session.
Location: ${location || 'unknown'}. Party: ${party || 'solo adventurer'}.
${dmContext ? `DM Notes: ${dmContext}` : ''}
Recent history:
${history || '(session just started)'}

The player says/does: "${playerAction}"

Respond as the DM in 2-3 sentences. Describe what happens, present choices or consequences. Stay in character. Include any dice roll results if combat occurs (format: [d20: X]).`;
    return callAIHelper(db, prompt, { maxTokens: 300, temperature: 0.9 });
}

// ─── ADMIN/REF DM MODE — Human DM with AI assist ───────────────
// AI helps a human DM by generating descriptions, NPC responses, etc.
async function dmAssist(db, { dmInstruction, partyMembers, location, worldTone }) {
    if (!await isAIEnabled(db, 'ai_admin_dm_mode')) return null;
    const party = (partyMembers || []).map(p => `${p.name} (${p.class}, Lv${p.level})`).join(', ');
    const prompt = `You are assisting a human Dungeon Master in a ${worldTone || 'dark fantasy'} RPG.
Location: ${location || 'unknown'}. Party: ${party || 'adventurers'}.
The DM wants: "${dmInstruction}"
Generate the requested content (NPC dialogue, room description, encounter, etc.) in 2-4 sentences. Stay in the world's tone.`;
    return callAIHelper(db, prompt, { maxTokens: 250, temperature: 0.85 });
}

module.exports = {
    narrateBattle, generateQuest, generateItemText, generateLore,
    describeRegion, moderateChat, generateRumor, narrateDeath,
    companionReaction, craftingHint, generateWorldEvent,
    smartEnemyTactic, generateBiography, dmResponse, dmAssist,
};
