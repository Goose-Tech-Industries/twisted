"use client"

import { useState, useEffect, useCallback } from "react"
import adminApi from "@/lib/admin-api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Info, RotateCcw, Plus, Trash2, CheckCircle, XCircle, Loader2, FlaskConical, Search } from "lucide-react"
import { toast } from "@/hooks/use-toast"

// ── Type definitions matching settings_manager.js LABEL_GROUPS ──
type RowDef = [string, string, string, string] // [key, label, default, hint]
interface GroupDef { title: string; desc: string; rows: RowDef[] }

const LABEL_GROUPS: Record<string, GroupDef> = {
  labels_identity: {
    title: '🎮 Game Identity', desc: 'Core game name and currency. Shown everywhere.',
    rows: [
      ['label_game_name',    'Game Name',        'Twisted Engine', 'Shown in page title and UI'],
      ['label_currency',     'Currency Name',    'Gold',           'e.g. Gold, Coins, Souls'],
      ['label_currency_icon','Currency Icon',    '💰',             'Emoji shown next to amounts'],
      ['label_experience',   'Experience Label', 'XP',             'e.g. XP, Soul Shards, Points'],
      ['label_level',        'Level Label',      'Lv',             'e.g. Lv, Level, Tier'],
    ]
  },
  labels_battle: {
    title: '⚔️ Battle System', desc: 'Labels shown in the battle UI.',
    rows: [
      ['label_attack',      'Attack Command',    'Attack',       'Default physical attack button'],
      ['label_defend',      'Defend Command',    'Defend',       'Default defend/block button'],
      ['label_skills_menu', 'Skills Menu Label', 'Skills',       'The sub-menu button in battle'],
      ['label_items_menu',  'Items Menu Label',  'Items',        'The items sub-menu button'],
      ['label_limit_break', 'Limit Break Name',  'Limit Break',  'The ultimate gauge name'],
      ['label_limit_icon',  'Limit Break Icon',  '⚡',           'Icon shown on the gauge'],
      ['label_crit',        'Critical Hit Text', 'CRITICAL!',    'Shown when a crit lands'],
      ['label_miss',        'Miss Text',         'MISS!',        'Shown when an attack misses'],
    ]
  },
  labels_ogham: {
    title: '🩸 Blood Ogham System', desc: 'Rename the entire socketed rune system completely.',
    rows: [
      ['label_ogham_system', 'System Name',          'Blood Ogham',     'e.g. Rune Slots, Materia, Crystals'],
      ['label_ogham_plural', 'System Name (plural)', 'Blood Oghams',    'e.g. Runes, Materia, Shards'],
      ['label_ogham_slot',   'Slot Name',            'Ogham Groove',    'e.g. Socket, Slot, Rune Slot'],
      ['label_ogham_slots',  'Slot Name (plural)',   'Ogham Grooves',   'e.g. Sockets, Slots'],
      ['label_ogham_rank1',  'Rank 1 Name',          'Carved',          'e.g. Basic, Tier I, Common'],
      ['label_ogham_rank2',  'Rank 2 Name',          'Inscribed',       'e.g. Enhanced, Tier II, Rare'],
      ['label_ogham_rank3',  'Rank 3 Name',          'Bloodbound',      'e.g. Mastered, Tier III, Legendary'],
      ['label_ogham_rankup', 'Rank-Up Notification', '— your {system} deepens!', '{system} = system name, {name} = ogham name'],
      ['label_ogham_lore',   'Lore Prefix',          'Blood Ogham are carved prayers to things that should not answer.', 'Shown in item description'],
    ]
  },
  labels_stats: {
    title: '📊 Stat Names', desc: 'Rename any stat. ATK could be "Power", DEF could be "Armor".',
    rows: [
      ['label_stat_atk',   'ATK Label',   'ATK',   'Physical attack power'],
      ['label_stat_def',   'DEF Label',   'DEF',   'Physical defense'],
      ['label_stat_mo',    'MO Label',    'MO',    'Magic Offense'],
      ['label_stat_md',    'MD Label',    'MD',    'Magic Defense'],
      ['label_stat_speed', 'Speed Label', 'Speed', 'Turn order / evasion'],
      ['label_stat_luck',  'Luck Label',  'Luck',  'Crit / item find chance'],
      ['label_stat_hp',    'HP Label',    'HP',    'Hit Points / Health'],
      ['label_stat_mp',    'MP Label',    'MP',    'Magic Points / Mana'],
    ]
  },
  labels_ui: {
    title: '🖥️ UI & Panels', desc: 'Labels on menus, panels, and notifications.',
    rows: [
      ['label_inventory',   'Inventory Tab',    'Inventory', ''],
      ['label_equipment',   'Equipment Tab',    'Equipment', ''],
      ['label_character',   'Character Tab',    'Character', ''],
      ['label_skills_tab',  'Skills Tab',       'Skills',    ''],
      ['label_quests_tab',  'Quests Tab',       'Quests',    ''],
      ['label_party',       'Party Label',      'Party',     ''],
      ['label_guild',       'Guild Label',      'Guild',     ''],
      ['label_rank_up_msg', 'Level Up Message', 'Level Up!', 'Shown when player levels up'],
      ['label_victory',     'Victory Screen',   'VICTORY',   'Shown when winning a battle'],
      ['label_defeat',      'Defeat Screen',    'DEFEATED',  'Shown when losing a battle'],
    ]
  },
  config_gameplay: {
    title: '⚙️ Gameplay Config', desc: 'Numbers that affect game balance. Changes are live immediately.',
    rows: [
      ['config_xp_multiplier',    'XP Multiplier',          '1',     'e.g. 2 = double XP for all'],
      ['config_gold_multiplier',  'Gold Multiplier',        '1',     'e.g. 1.5 = 50% more gold'],
      ['config_crit_chance_base', 'Base Crit Chance %',     '10',    'Default crit % before luck'],
      ['config_ogham_drop_chance','Ogham Drop Chance %',    '5',     'Chance enemies drop an Ogham'],
      ['config_pvp_enabled',      'PvP Enabled',            'true',  'Allow player vs player combat'],
      ['config_respawn_hp_pct',   'Respawn HP %',           '50',    '% of max HP restored on respawn'],
      ['pvp_team_size',           'PvP Team Size',          '3',     'Max characters per user in PvP (1–6)'],
      ['max_dungeon_size',        'Max Dungeon Party Size', '5',     'Max players in a dungeon party (1–6)'],
      ['max_party_size',          'Max Party Size',         '4',     'Max players in a standard party'],
      ['battle_grid_w',           'Battle Grid Width',      '8',     'Horizontal tile count (6–16)'],
      ['battle_grid_h',           'Battle Grid Height',     '5',     'Vertical tile count (4–10)'],
    ]
  },
  login_rewards: { title: '🎁 Login Rewards', desc: 'Daily login streak gold rewards for each day.', rows: [] },
  config_ai:     { title: '🤖 AI Brain',      desc: 'Configure the AI provider for NPC dialogue. Changes take effect within 60 seconds.', rows: [] },
  config_referral: {
    title: '🔗 Referral Rewards', desc: 'When a referred player hits the threshold level, the referrer earns gold/XP.',
    rows: [
      ['referral_threshold_level', 'Threshold Level', '5',   'Level the referred player must reach'],
      ['referral_gold_reward',     'Gold Reward',     '500', 'Gold awarded to the referrer (0 = off)'],
      ['referral_xp_reward',       'Bonus XP Reward', '0',   'Bonus XP awarded (0 = off)'],
    ]
  }
}

const ALL_KNOWN_KEYS = new Set(
  Object.values(LABEL_GROUPS).flatMap(g => g.rows.map(r => r[0]))
)

function Help({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 p-3 bg-blue-950/40 border border-blue-500/20 rounded-lg text-xs text-blue-300 mb-4">
      <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
      <div className="leading-relaxed">{children}</div>
    </div>
  )
}

// ── Single setting card ───────────────────────────────────────────
function SettingCard({ row, data, onSave }: {
  row: RowDef
  data: Record<string, string>
  onSave: (key: string, val: string) => Promise<void>
}) {
  const [key, label, defaultVal, hint] = row
  const current = data[key] !== undefined ? String(data[key]) : defaultVal
  const [val, setVal] = useState(current)
  const [saving, setSaving] = useState(false)
  const isDirty = data[key] !== undefined && String(data[key]) !== defaultVal
  const isBool = defaultVal === 'true' || defaultVal === 'false'

  useEffect(() => { setVal(data[key] !== undefined ? String(data[key]) : defaultVal) }, [data, key, defaultVal])

  const handleChange = async (newVal: string) => {
    setVal(newVal)
    setSaving(true)
    await onSave(key, newVal)
    setSaving(false)
  }

  return (
    <div className={`relative p-3 rounded-lg border bg-card transition-colors ${isDirty ? 'border-primary/50' : 'border-border'}`}>
      {isDirty && (
        <Badge className="absolute top-2 right-2 text-[9px] py-0 px-1.5 bg-primary text-primary-foreground">CUSTOM</Badge>
      )}
      <div className="text-xs font-semibold text-foreground mb-0.5">{label}</div>
      {hint && <div className="text-[11px] text-muted-foreground mb-1.5">{hint}</div>}
      <div className="flex gap-1.5 items-center">
        {isBool ? (
          <select value={val} onChange={e => handleChange(e.target.value)}
            className="flex-1 px-2 py-1.5 bg-input border border-border rounded text-xs">
            <option value="true">✅ Enabled</option>
            <option value="false">❌ Disabled</option>
          </select>
        ) : (
          <Input value={val} onChange={e => setVal(e.target.value)}
            onBlur={e => { if (e.target.value !== current) handleChange(e.target.value) }}
            onKeyDown={e => { if (e.key === 'Enter') handleChange((e.target as HTMLInputElement).value) }}
            className={`flex-1 h-8 text-xs ${isDirty ? 'border-primary/50' : ''}`} />
        )}
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        {isDirty && !saving && (
          <button onClick={() => handleChange(defaultVal)} title={`Reset to: ${defaultVal}`}
            className="text-muted-foreground hover:text-foreground transition-colors">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="text-[10px] text-muted-foreground/40 font-mono mt-1">{key}</div>
    </div>
  )
}

// ── AI Brain tab ───────────────────────────────────────────────────
function AiTab({ data, onSave }: { data: Record<string, string>; onSave: (k: string, v: string) => Promise<void> }) {
  const get = (k: string, def = '') => data[k] !== undefined ? String(data[k]) : def
  const [provider, setProvider] = useState(get('ai_provider', 'disabled'))
  const [apiKey, setApiKey] = useState(get('ai_api_key'))
  const [model, setModel] = useState(get('ai_model'))
  const [baseUrl, setBaseUrl] = useState(get('ai_base_url'))
  const [maxTokens, setMaxTokens] = useState(get('ai_max_tokens', '256'))
  const [systemPrompt, setSystemPrompt] = useState(get('ai_system_prompt'))
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testResult, setTestResult] = useState<null | { success: boolean; reply?: string; provider?: string; model?: string; ms?: number; message?: string }>(null)
  const [temp, setTemp] = useState(get('ai_temperature', '0.85'))
  const [showKey, setShowKey] = useState(false)

  const saveAll = async () => {
    setSaving(true); setSaved(false)
    await onSave('ai_provider', provider)
    await onSave('ai_api_key', apiKey)
    await onSave('ai_model', model)
    await onSave('ai_base_url', baseUrl)
    await onSave('ai_temperature', temp)
    await onSave('ai_max_tokens', maxTokens)
    if (systemPrompt) await onSave('ai_system_prompt', systemPrompt)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const providerHints: Record<string, string> = {
    disabled:  'No AI — NPCs use smart rule-based replies. Always works, no cost.',
    gemini:    'Google Gemini. Free tier at aistudio.google.com. Best for most setups.',
    anthropic: 'Anthropic Claude. Get a key at console.anthropic.com.',
    openai:    'OpenAI or any OpenAI-compatible API (Groq, LM Studio, Together, etc.)',
    ollama:    'Self-hosted Ollama. Set the base URL to your Ollama instance.',
  }
  const defaultModels: Record<string, string> = {
    gemini: 'gemini-1.5-flash', anthropic: 'claude-haiku-4-5-20251001',
    openai: 'gpt-4o-mini', ollama: 'llama3', disabled: ''
  }
  const needsKey = ['gemini','anthropic','openai'].includes(provider)
  const needsUrl = ['ollama','openai'].includes(provider)

  const testAi = async () => {
    setTesting(true); setTestResult(null)
    try {
      const r = await fetch('/admin/test-ai', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } })
      const d = await r.json()
      setTestResult(d)
    } catch (e) { setTestResult({ success: false, message: String(e) }) }
    setTesting(false)
  }

  return (
    <div className="space-y-4">
      <Help>
        Changes to AI settings take effect within 60 seconds — no server restart needed.
        Start with <b>Disabled</b> to test the game without AI costs, then enable once your NPC personas are written.
        <b> API keys</b> are stored in the database on the server — never exposed to players.
      </Help>

      {/* Provider */}
      <div className="p-4 bg-card border border-border rounded-lg">
        <label className="text-sm font-semibold block mb-1">AI Provider</label>
        <p className="text-xs text-muted-foreground mb-2">{providerHints[provider] || ''}</p>
        <select value={provider} onChange={e => setProvider(e.target.value)}
          className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm">
          <option value="disabled">🚫 Disabled (rule-based only)</option>
          <option value="gemini">✨ Gemini (Google — free tier)</option>
          <option value="anthropic">🤖 Claude (Anthropic)</option>
          <option value="openai">🟢 OpenAI / OpenAI-compatible</option>
          <option value="ollama">🦙 Ollama (self-hosted)</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* API Key */}
        <div className={`p-4 bg-card border border-border rounded-lg transition-opacity ${!needsKey ? 'opacity-40 pointer-events-none' : ''}`}>
          <label className="text-sm font-semibold block mb-1">API Key</label>
          <p className="text-xs text-muted-foreground mb-2">Stored in the database. Never shown to players.</p>
          <Input type={showKey ? 'text' : 'password'} value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="Paste your API key here…" className="text-sm mb-2" />
          <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground">
            <input type="checkbox" checked={showKey} onChange={e => setShowKey(e.target.checked)} className="w-3.5 h-3.5" />
            Show key
          </label>
        </div>

        {/* Model */}
        <div className="p-4 bg-card border border-border rounded-lg">
          <label className="text-sm font-semibold block mb-1">Model</label>
          <p className="text-xs text-muted-foreground mb-2">Leave blank to use the default for your provider.</p>
          <Input value={model} onChange={e => setModel(e.target.value)}
            placeholder={defaultModels[provider] || 'e.g. llama3'} className="text-sm" />
        </div>

        {/* Base URL */}
        <div className={`p-4 bg-card border border-border rounded-lg col-span-2 transition-opacity ${!needsUrl ? 'opacity-40 pointer-events-none' : ''}`}>
          <label className="text-sm font-semibold block mb-1">Base URL <span className="text-muted-foreground font-normal">(Ollama / OpenAI-compatible only)</span></label>
          <p className="text-xs text-muted-foreground mb-2">e.g. http://localhost:11434/api/generate for Ollama, or http://localhost:1234/v1 for LM Studio</p>
          <Input value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
            placeholder="http://localhost:11434/api/generate" className="text-sm" />
        </div>

        {/* Temperature */}
        <div className="p-4 bg-card border border-border rounded-lg">
          <label className="text-sm font-semibold block mb-1">
            Temperature <span className="text-primary font-mono">{temp}</span>
          </label>
          <p className="text-xs text-muted-foreground mb-2">0.0 = robotic. 1.0 = very creative. 0.85 is the sweet spot for NPCs.</p>
          <input type="range" min="0" max="1" step="0.05" value={temp}
            onChange={e => setTemp(e.target.value)}
            className="w-full accent-primary" />
        </div>

        {/* Max Tokens */}
        <div className="p-4 bg-card border border-border rounded-lg">
          <label className="text-sm font-semibold block mb-1">Max Tokens</label>
          <p className="text-xs text-muted-foreground mb-2">Max reply length. 256 = 1–3 sentences. Higher = more expensive.</p>
          <Input type="number" min={64} max={1024} step={32} value={maxTokens}
            onChange={e => setMaxTokens(e.target.value)} className="text-sm" />
        </div>

        {/* System Prompt */}
        <div className="p-4 bg-card border border-border rounded-lg col-span-2">
          <label className="text-sm font-semibold block mb-1">World System Prompt</label>
          <p className="text-xs text-muted-foreground mb-2">
            Injected into every NPC prompt as world context. Set the tone, lore, and language style for your world.
            Leave blank for the built-in Celtic dark fantasy default.
          </p>
          <textarea rows={5} value={systemPrompt}
            onChange={e => setSystemPrompt(e.target.value)}
            placeholder="e.g. a dark Celtic fantasy world where the dead do not always stay dead, and every oath has a price. Dialogue should be weary, grounded, and tinged with dread."
            className="w-full px-3 py-2 bg-input border border-border rounded-md text-xs font-mono resize-y" />
        </div>
      </div>

      {/* Save + Test */}
      <div className="flex items-center gap-4 flex-wrap">
        <Button onClick={saveAll} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          {saved ? '✓ Saved!' : saving ? 'Saving...' : 'Save AI Settings'}
        </Button>
        <Button onClick={testAi} disabled={testing || provider === 'disabled'} variant="outline">
          {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FlaskConical className="w-4 h-4 mr-2" />}
          Test Connection
        </Button>
        <span className="text-xs text-muted-foreground">Save first, then test. Takes a few seconds.</span>
      </div>
      {testResult && (
        <div className={`p-4 rounded-lg border text-sm ${testResult.success ? 'bg-green-950/30 border-green-800' : 'bg-red-950/30 border-red-800'}`}>
          {testResult.success ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-green-400 font-medium text-xs">
                  {testResult.provider?.toUpperCase()} {testResult.model ? `· ${testResult.model}` : ''} · {testResult.ms}ms
                </span>
              </div>
              <p className="text-muted-foreground italic text-xs">"{testResult.reply}"</p>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-400" />
              <span className="text-red-300 text-xs">{testResult.message}</span>
            </div>
          )}
        </div>
      )}

      {/* AI Feature Toggles */}
      <div className="mt-6 p-4 bg-card border border-border rounded-lg">
        <h3 className="text-sm font-bold mb-1">AI-Powered Features</h3>
        <p className="text-xs text-muted-foreground mb-3">Toggle individual AI features on/off. All require a working AI provider above.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {[
            ['ai_battle_narration',     '⚔️ Battle Narration',       'Dramatic combat descriptions for attacks and kills'],
            ['ai_quest_generation',     '📜 Quest Generation',       'AI creates dynamic side quests for players'],
            ['ai_item_flavor_text',     '📦 Item Flavor Text',       'Auto-generate item descriptions'],
            ['ai_lore_books',           '📖 Lore Books',             'Generate readable in-world lore texts'],
            ['ai_region_descriptions',  '🗺️ Region Descriptions',    'Atmospheric text when entering a new map'],
            ['ai_chat_moderation',      '🛡️ Chat Moderation',       'Flag toxic messages for staff review'],
            ['ai_npc_rumors',           '🗣️ NPC Rumors',            'NPCs generate gossip based on world events'],
            ['ai_death_narration',      '💀 Death Narration',        'Dramatic defeat text on player death'],
            ['ai_companion_reactions',  '🤝 Companion Reactions',    'Companions comment on events'],
            ['ai_crafting_hints',       '🔨 Crafting Hints',         'AI suggests what ingredients might create'],
            ['ai_dynamic_world_events', '🌍 Dynamic World Events',   'AI generates world events based on activity'],
            ['ai_smart_enemy_ai',       '🧠 Smart Enemy AI',         'AI picks enemy battle tactics'],
            ['ai_player_biography',     '📝 Player Biography',       'Generate character story from their history'],
            ['ai_dm_mode',              '🎲 AI Dungeon Master',      'AI runs tabletop-style DM sessions for parties'],
            ['ai_admin_dm_mode',        '👑 Admin DM Mode',          'Staff runs DM sessions with AI assist'],
          ].map(([key, label, desc]) => (
            <div key={key} className="flex items-center gap-3 p-2 rounded border border-border/50 hover:bg-secondary/30 transition-colors">
              <button
                onClick={async () => {
                  const newVal = get(key, 'false') === 'true' ? 'false' : 'true'
                  await onSave(key, newVal)
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                  get(key, 'false') === 'true'
                    ? 'bg-green-900/40 text-green-400 border border-green-600/30'
                    : 'bg-red-900/30 text-red-400 border border-red-600/30'
                }`}>
                {get(key, 'false') === 'true' ? '✓ ON' : '✗ OFF'}
              </button>
              <div className="min-w-0">
                <div className="text-xs font-medium truncate">{label}</div>
                <div className="text-[10px] text-muted-foreground truncate">{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Login Rewards tab ─────────────────────────────────────────────
function LoginRewardsTab({ data, onSave }: { data: Record<string, string>; onSave: (k: string, v: string) => Promise<void> }) {
  const ICONS = ['🥉','🥈','🥇','💎','👑','⚡','🌟']
  let initial = [50, 100, 150, 200, 300, 400, 500]
  try { if (data.daily_login_rewards) initial = JSON.parse(data.daily_login_rewards) } catch {}
  const [rewards, setRewards] = useState(initial)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    await onSave('daily_login_rewards', JSON.stringify(rewards))
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div>
      <Help>
        Gold awarded when a player logs in on consecutive days. Day 7+ repeats the Day 7 amount.
        Players who miss a day reset to Day 1. Set any day to 0 to give no reward for that day.
      </Help>
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 mb-6">
        {rewards.slice(0,7).map((amt, i) => (
          <div key={i} className="p-3 bg-card border border-border rounded-lg text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Day {i+1}{i === 6 ? ' +' : ''}
            </div>
            <div className="text-2xl mb-2">{ICONS[i]}</div>
            <Input type="number" value={amt} min={0}
              onChange={e => {
                const next = [...rewards]
                next[i] = parseInt(e.target.value) || 0
                setRewards(next)
              }}
              className="text-center text-sm h-8" />
            <div className="text-[10px] text-yellow-500 mt-1">💰 gold</div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={handleSave}>💾 Save Rewards</Button>
        {saved && <span className="text-xs text-green-400">✅ Saved!</span>}
      </div>
    </div>
  )
}

// ── Main Settings Panel ───────────────────────────────────────────
export function SettingsPanel() {
  const [data, setData] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('labels_identity')
  const [customKey, setCustomKey] = useState('')
  const [customVal, setCustomVal] = useState('')
  const [settingsCat, setSettingsCat] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    const r = await adminApi.settings.get()
    if (r.success && r.data) setData(r.data as Record<string, string>)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const saveSetting = useCallback(async (key: string, value: string) => {
    const updated = { ...data, [key]: value }
    setData(updated)
    await adminApi.settings.update({ [key]: value })
  }, [data])

  const deleteSetting = async (key: string) => {
    if (!confirm(`Delete custom setting "${key}"?`)) return
    const updated = { ...data }
    delete updated[key]
    setData(updated)
    await fetch(`/admin/delete-setting`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    })
  }

  const addCustom = async () => {
    const k = customKey.trim().replace(/\s+/g,'_')
    if (!k) { toast({ title: 'Key is required', variant: 'destructive' }); return }
    await saveSetting(k, customVal)
    setCustomKey(''); setCustomVal('')
  }

  const exportLabels = () => {
    const out: Record<string, string> = {}
    Object.values(LABEL_GROUPS).forEach(g =>
      g.rows.forEach(([key,,def]) => { out[key] = data[key] ?? def })
    )
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'game_labels.json'
    a.click()
  }

  const group = LABEL_GROUPS[activeTab]
  const customKeys = Object.keys(data).filter(k => !ALL_KNOWN_KEYS.has(k)).sort()

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  )

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">⚙️ Settings & Labels</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Changes save automatically. Labels marked{' '}
            <Badge className="text-[9px] px-1 py-0 bg-primary text-primary-foreground">CUSTOM</Badge>{' '}
            are overriding their defaults — click ↩ to reset.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportLabels}>⬇ Export Labels</Button>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-0.5 border-b border-border mb-6">
        {Object.entries(LABEL_GROUPS).map(([key, g]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap -mb-px ${
              activeTab === key
                ? 'border-primary text-primary bg-card rounded-t'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            {g.title}
          </button>
        ))}
        <button onClick={() => setActiveTab('all_settings')}
          className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap -mb-px ${
            activeTab === 'all_settings'
              ? 'border-primary text-primary bg-card rounded-t'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}>
          🔍 All Settings ({Object.keys(data).length})
        </button>
      </div>

      {/* All Settings browser — organized by category */}
      {activeTab === 'all_settings' && (() => {
        const [search, setSearch] = [customKey, setCustomKey]
        const SETTING_CATEGORIES: Record<string, { label: string; icon: string; match: (k: string) => boolean }> = {
          general: { label: 'General', icon: '🎮', match: k => /^(game_|server_|setup_|template_|max_char|starting_|respec_|referral_)/.test(k) },
          ai: { label: 'AI & NPC', icon: '🤖', match: k => k.startsWith('ai_') || k.startsWith('npc_') },
          battle: { label: 'Battle Core', icon: '⚔️', match: k => /^(battle_|back_row|auto_battle|enable_brave|enable_auto_battle|enable_damage_preview|enable_formations|enable_party_swap|enable_interrupts|enable_turn_manipulation|enable_passive_abilities|enable_custom_win)/.test(k) },
          combat_rules: { label: 'Combat Rules', icon: '📏', match: k => /^(dice_|dodge_|counter_|block_|combo_|stagger_|morale|rage_|wound_|break_|baton_|beam_|aggro_|diminishing_|flavor_text|enable_dice|enable_combo|enable_counter|enable_stagger|enable_morale|enable_rage|enable_wound|enable_break|enable_beam|enable_aggro|enable_diminishing|enable_flavor|enable_rp_|enable_one_more|enable_action_command|action_command)/.test(k) },
          limb_ki: { label: 'Limb & Ki', icon: '🦾', match: k => /^(limb_|ki_|enable_limb|enable_ki|called_shot|ko_|nonlethal|enable_nonlethal|sig_tech|enable_signature)/.test(k) },
          defense: { label: 'Defense & Dodge', icon: '🛡️', match: k => /^(defense_|enable_active_defense|enable_advantage|enable_cover|tabletop_)/.test(k) },
          movement: { label: 'Movement', icon: '🚶', match: k => /^(movement_|allow_player_speed|enable_mounts)/.test(k) },
          economy: { label: 'Economy', icon: '💰', match: k => /^(gold_|xp_|auction_|enable_bank|enable_bounty|enable_inns|enemy_scaling|enable_gathering|enable_creature_capture|enable_treasure)/.test(k) },
          social: { label: 'Social', icon: '💬', match: k => /^(max_party|max_guild|max_active|max_reserve|enable_pvp|enable_greet|enable_tournament|enable_player_housing|dual_class|enable_mentor|mentor_|enable_alignment|alignment_|enable_seasons|enable_rolling_hp|rolling_hp)/.test(k) },
          magic: { label: 'Magic & Elements', icon: '✨', match: k => /^(enable_magic|magic_duel|enable_weapon_triangle|ogham_|enable_feat|enable_background)/.test(k) },
          assets: { label: 'Assets & Upload', icon: '📁', match: k => /^(allowed_|max_upload|enable_custom_assets|enable_autotil)/.test(k) },
          tabletop: { label: 'Tabletop Rules', icon: '🎲', match: k => k.startsWith('tabletop_') || k === 'enable_tabletop_rules' || k.startsWith('enable_battle_rules') },
        }
        const allKeys = Object.keys(data).sort()
        let filtered = search ? allKeys.filter(k => k.toLowerCase().includes(search.toLowerCase()) || (data[k] || '').toLowerCase().includes(search.toLowerCase())) : allKeys
        if (settingsCat !== 'all') {
          const cat = SETTING_CATEGORIES[settingsCat]
          if (cat) filtered = filtered.filter(k => cat.match(k))
        }
        // Group by prefix
        const groups: Record<string, string[]> = {}
        for (const k of filtered) {
          const prefix = k.split('_').slice(0, 2).join('_')
          if (!groups[prefix]) groups[prefix] = []
          groups[prefix].push(k)
        }
        return (
          <div>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search settings..." className="pl-10" />
            </div>
            {/* Category filter pills */}
            <div className="flex flex-wrap gap-1 mb-3">
              <button onClick={() => setSettingsCat('all')}
                className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${settingsCat === 'all' ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-card border border-border text-muted-foreground hover:text-foreground'}`}>
                All ({allKeys.length})
              </button>
              {Object.entries(SETTING_CATEGORIES).map(([key, cat]) => {
                const count = allKeys.filter(k => cat.match(k)).length
                if (!count) return null
                return (
                  <button key={key} onClick={() => setSettingsCat(key)}
                    className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${settingsCat === key ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-card border border-border text-muted-foreground hover:text-foreground'}`}>
                    {cat.icon} {cat.label} ({count})
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground mb-3">Showing {filtered.length} of {allKeys.length} settings. Edit any value and it saves automatically.</p>
            {Object.entries(groups).map(([prefix, keys]) => (
              <div key={prefix} className="mb-4">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 px-1">{prefix}</h3>
                <div className="space-y-1">
                  {keys.map(k => {
                    const isBool = data[k] === 'true' || data[k] === 'false'
                    return (
                    <div key={k} className="flex items-center gap-2 p-2 bg-card border border-border rounded text-xs">
                      <code className="text-purple-400 font-mono flex-shrink-0 w-48 truncate" title={k}>{k}</code>
                      {isBool ? (
                        <button onClick={() => saveSetting(k, data[k] === 'true' ? 'false' : 'true')}
                          className={`px-3 py-1 rounded text-xs font-bold ${data[k] === 'true' ? 'bg-green-900/40 text-green-400 border border-green-600/30' : 'bg-red-900/30 text-red-400 border border-red-600/30'}`}>
                          {data[k] === 'true' ? '✓ ON' : '✗ OFF'}
                        </button>
                      ) : (
                        <Input value={data[k] || ''} onChange={e => saveSetting(k, e.target.value)}
                          className="h-7 text-xs flex-1" />
                      )}
                    </div>
                    )})}
                </div>
              </div>
            ))}
          </div>
        )
      })()}

      {/* Tab description */}
      {activeTab !== 'all_settings' && group && <p className="text-xs text-muted-foreground mb-4">{group.desc}</p>}

      {/* Custom tab renderers */}
      {activeTab === 'config_ai' && <AiTab data={data} onSave={saveSetting} />}
      {activeTab === 'login_rewards' && <LoginRewardsTab data={data} onSave={saveSetting} />}

      {/* Standard grid for all other tabs */}
      {activeTab !== 'config_ai' && activeTab !== 'login_rewards' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {group.rows.map(row => (
              <SettingCard key={row[0]} row={row} data={data} onSave={saveSetting} />
            ))}
          </div>

          {/* Custom settings section (only on first tab) */}
          {activeTab === 'labels_identity' && customKeys.length > 0 && (
            <div className="mt-8">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">🔧 Custom Settings</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {customKeys.map(key => (
                  <div key={key} className="flex items-center gap-2 p-2.5 bg-card border border-border rounded-lg">
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-mono text-muted-foreground truncate">{key}</div>
                      <Input value={String(data[key])} onChange={e => saveSetting(key, e.target.value)}
                        className="mt-1 h-7 text-xs" />
                    </div>
                    <button onClick={() => deleteSetting(key)} className="text-destructive hover:text-red-400 transition-colors flex-shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add custom */}
          {activeTab === 'labels_identity' && (
            <div className="mt-6 p-4 bg-card border border-dashed border-border rounded-lg">
              <h3 className="text-xs font-semibold mb-3 text-muted-foreground">+ Add Custom Setting</h3>
              <div className="flex gap-2">
                <Input value={customKey} onChange={e => setCustomKey(e.target.value)}
                  placeholder="setting_key" className="flex-1 text-xs font-mono h-8" />
                <Input value={customVal} onChange={e => setCustomVal(e.target.value)}
                  placeholder="value" className="flex-1 text-xs h-8" />
                <Button size="sm" onClick={addCustom}><Plus className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
