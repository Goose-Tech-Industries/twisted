"use client"

import { useEffect, useMemo, useState } from "react"

const LEGACY_SCRIPT_PATHS = [
  "/sauce/js/api.js",
  "/sauce/js/managers/builders.js",
  "/sauce/js/managers/generic_manager.js",
  "/sauce/js/managers/map_manager.js",
  "/sauce/js/managers/class_manager.js",
  "/sauce/js/managers/race_manager.js",
  "/sauce/js/managers/bg_manager.js",
  "/sauce/js/managers/feat_manager.js",
  "/sauce/js/managers/stat_manager.js",
  "/sauce/js/managers/item_manager.js",
  "/sauce/js/managers/craft_manager.js",
  "/sauce/js/managers/auction_manager.js",
  "/sauce/js/managers/scheduler_manager.js",
  "/sauce/js/managers/region_manager.js",
  "/sauce/js/managers/questboard_manager.js",
  "/sauce/js/managers/npc_manager.js",
  "/sauce/js/managers/script_editor.js",
  "/sauce/js/managers/node_graph_editor.js",
  "/sauce/js/managers/battle_cmd_manager.js",
  "/sauce/js/managers/spawn_manager.js",
  "/sauce/js/managers/arena_manager.js",
  "/sauce/js/managers/shop_manager.js",
  "/sauce/js/managers/settings_manager.js",
  "/sauce/js/managers/quest_manager.js",
  "/sauce/js/managers/artifact_manager.js",
  "/sauce/js/managers/world_manager.js",
  "/sauce/js/managers/skill_manager.js",
  "/sauce/js/managers/status_manager.js",
  "/sauce/js/managers/limit_manager.js",
  "/sauce/js/managers/ogham_manager.js",
  "/sauce/js/managers/ogham_family_manager.js",
  "/sauce/js/managers/world_forge.js",
  "/sauce/js/managers/dashboard.js",
  "/sauce/js/managers/player_manager.js",
  "/sauce/js/managers/gm_tools.js",
  "/sauce/js/managers/loot_manager.js",
  "/sauce/js/managers/economy_dashboard.js",
  "/sauce/js/managers/event_log.js",
  "/sauce/js/managers/map_connections.js",
  "/sauce/js/managers/gm_notes.js",
  "/sauce/js/managers/live_social.js",
  "/sauce/js/managers/character_creator.js",
  "/sauce/js/managers/achievement_manager.js",
  "/sauce/js/managers/reports_manager.js",
  "/sauce/js/managers/referral_manager.js",
] as const

const LEGACY_BRIDGE_SOURCE = String.raw`
(function () {
  if (window.__TE_ADMIN_RUNTIME_READY__) return;

  const friendlyTitle = (key) => String(key || 'dashboard').replace(/_/g, ' ').toUpperCase();

  const Managers = {
    map:          typeof MapManager !== 'undefined' ? MapManager : null,
    class:        typeof ClassManager !== 'undefined' ? ClassManager : null,
    race:         typeof RaceManager !== 'undefined' ? RaceManager : null,
    bg:           typeof BgManager !== 'undefined' ? BgManager : null,
    feat:         typeof FeatManager !== 'undefined' ? FeatManager : null,
    stat:         typeof StatManager !== 'undefined' ? StatManager : null,
    item:         typeof ItemManager !== 'undefined' ? ItemManager : null,
    npc:          typeof NpcManager !== 'undefined' ? NpcManager : null,
    battle_cmd:   typeof BattleCmdManager !== 'undefined' ? BattleCmdManager : null,
    spawn:        typeof SpawnManager !== 'undefined' ? SpawnManager : null,
    arena:        typeof ArenaManager !== 'undefined' ? ArenaManager : null,
    shop_supply:  typeof ShopSupplyManager !== 'undefined' ? ShopSupplyManager : null,
    setting:      typeof SettingsManager !== 'undefined' ? SettingsManager : null,
    quest:        typeof QuestManager !== 'undefined' ? QuestManager : null,
    artifact:     typeof ArtifactManager !== 'undefined' ? ArtifactManager : null,
    world:        typeof WorldManager !== 'undefined' ? WorldManager : null,
    skill:        typeof SkillManager !== 'undefined' ? SkillManager : null,
    craft:        typeof CraftManager !== 'undefined' ? CraftManager : null,
    auction:      typeof AuctionManager !== 'undefined' ? AuctionManager : null,
    scheduler:    typeof SchedulerManager !== 'undefined' ? SchedulerManager : null,
    region:       typeof RegionManager !== 'undefined' ? RegionManager : null,
    questboard:   typeof QuestBoardManager !== 'undefined' ? QuestBoardManager : null,
    status:       typeof StatusManager !== 'undefined' ? StatusManager : null,
    limit:        typeof LimitManager !== 'undefined' ? LimitManager : null,
    ogham:        typeof OghamManager !== 'undefined' ? OghamManager : null,
    ogham_family: typeof OghamFamilyManager !== 'undefined' ? OghamFamilyManager : null,
    world_forge:  typeof WorldForge !== 'undefined' ? WorldForge : null,
    dashboard:    typeof Dashboard !== 'undefined' ? Dashboard : null,
    player_manager: typeof PlayerManager !== 'undefined' ? PlayerManager : null,
    gm_tools:       typeof GmTools !== 'undefined' ? GmTools : null,
    loot_manager:   typeof LootManager !== 'undefined' ? LootManager : null,
    economy:        typeof EconomyDashboard !== 'undefined' ? EconomyDashboard : null,
    event_log:      typeof EventLog !== 'undefined' ? EventLog : null,
    map_connections: typeof MapConnections !== 'undefined' ? MapConnections : null,
    gm_notes:        typeof GmNotes !== 'undefined' ? GmNotes : null,
    live_social:     typeof LiveSocial !== 'undefined' ? LiveSocial : null,
    reports_manager: typeof ReportsManager !== 'undefined' ? ReportsManager : null,
    referral_manager: typeof ReferralManager !== 'undefined' ? ReferralManager : null,
    character_creator: typeof CharacterCreator !== 'undefined' ? CharacterCreator : null,
    achievement: typeof AchievementManager !== 'undefined' ? AchievementManager : null,
  };

  const GC = {
    element: {
      title: 'ELEMENT EDITOR', type: 'element',
      cols: ['name','icon','color','opposite_id','bonus_damage_pct'],
      fields: ['name','description','icon','color','opposite_id','bonus_damage_pct']
    },
    limit: {
      title: 'LIMIT BREAKS', type: 'limit',
      cols: ['class_id','name','icon','break_level','char_level_req','target_type'],
      fields: ['class_id','name','description','icon','break_level','char_level_req','target_type','effects']
    },
    level: {
      title: 'LEVEL TABLE', type: 'level',
      cols: ['level','xp_required','ap_awarded','xp_for_win','gold_for_win','hp_growth','mp_growth'],
      fields: ['level','xp_required','ap_awarded','xp_for_win','gold_for_win','hp_growth','mp_growth']
    },
    equip_slot: {
      title: 'EQUIP SLOTS', type: 'equip_slot',
      cols: ['slot_key','name','display_order'],
      fields: ['slot_key','name','display_order','add_hp','add_mp','add_atk','add_def','add_mo','add_md','add_speed','add_luck']
    },
    quest: {
      title: 'QUEST EDITOR', type: 'quest',
      cols: ['quest_id', 'title', 'required_level', 'quest_type', 'is_repeatable'],
      fields: ['quest_id', 'title', 'description', 'quest_type', 'category',
               'required_level', 'is_repeatable', 'repeat_cooldown_hours',
               'max_completions', 'objectives_json', 'rewards_json', 'is_active']
    },
    class_skill: {
      title: 'SKILL ASSIGNMENTS', type: 'class_skill',
      cols: ['class_id','skill_id','mp_cost','learn_level','alt_name'],
      fields: ['class_id','skill_id','mp_cost','learn_level','alt_name']
    },
    module: {
      title: 'MODULES', type: 'module',
      cols: ['module_key','module_name','is_installed'],
      fields: ['module_key','module_name','is_installed']
    },
    artifact_power: {
      title: 'ARTIFACT POWERS', type: 'artifact_power',
      cols: ['power_id','artifact_id','name','power_type','unlock_kills','rank_max'],
      fields: ['power_id','artifact_id','name','description','power_type','unlock_kills','rank_max','effect_json']
    }
  };

  const setTitles = (key) => {
    const title = friendlyTitle(key);
    const pageTitle = document.getElementById('pageTitle');
    const managerTitle = document.getElementById('managerTitle');
    if (pageTitle) pageTitle.textContent = title;
    if (managerTitle) managerTitle.textContent = title;
  };

  const runtime = {
    managers: Managers,
    genericConfigs: GC,
    load(key, emitChange) {
      setTitles(key);

      if (Managers[key] && typeof Managers[key].init === 'function') {
        Managers[key].init();
      } else if (GC[key] && typeof GenericManager !== 'undefined' && GenericManager && typeof GenericManager.init === 'function') {
        GenericManager.init(GC[key]);
      } else {
        const area = document.getElementById('dynamicArea');
        if (area) {
          area.innerHTML = '<p style="color:#f85149">Manager not found: ' + key + '</p>';
        }
      }

      if (emitChange !== false) {
        window.dispatchEvent(new CustomEvent('te-admin-section-change', {
          detail: { section: key }
        }));
      }
    }
  };

  window.__TE_ADMIN_RUNTIME__ = runtime;
  window.__TE_ADMIN_RUNTIME_READY__ = true;
  window.__TE_ADMIN_LOAD_MANAGER__ = function (key, emitChange) {
    runtime.load(key, emitChange);
  };
  window.loadManager = window.__TE_ADMIN_LOAD_MANAGER__;
})();
`

const LEGACY_STYLES = `
.legacy-admin-host {
  --bg:#0d1117;
  --bg2:#161b22;
  --bg3:#0d1117;
  --a:#bb86fc;
  --a2:#03dac6;
  --t:#c9d1d9;
  --td:#6e7681;
  --b:#30363d;
  --r:#f85149;
  --g:#3fb950;
  --y:#d29922;
  color: var(--t);
}
.legacy-admin-host *, .legacy-admin-host *::before, .legacy-admin-host *::after { box-sizing: border-box; }
.legacy-admin-shell {
  background: var(--bg);
  border: 1px solid var(--b);
  border-radius: 12px;
  overflow: hidden;
  min-height: calc(100vh - 64px);
}
.legacy-admin-topbar {
  padding: 18px 22px;
  border-bottom: 1px solid var(--b);
  background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0));
}
.legacy-admin-topbar h1 {
  margin: 0;
  font-size: 22px;
  border: 0;
  padding: 0;
  color: var(--t);
}
.legacy-admin-topbar p {
  margin: 6px 0 0;
  color: var(--td);
  font-size: 12px;
}
.legacy-admin-workspace {
  padding: 22px;
}
.legacy-admin-host table { width: 100%; border-collapse: collapse; margin-top: 16px; }
.legacy-admin-host th {
  text-align: left;
  color: var(--td);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .5px;
  border-bottom: 1px solid var(--b);
  padding: 10px 12px;
}
.legacy-admin-host td {
  padding: 10px 12px;
  border-bottom: 1px solid #21262d;
  font-size: 13px;
  vertical-align: top;
}
.legacy-admin-host tr:hover td { background: rgba(255,255,255,.02); }
.legacy-admin-host input,
.legacy-admin-host select,
.legacy-admin-host textarea,
.legacy-admin-host button {
  font-family: Consolas, Monaco, 'Courier New', monospace;
}
.legacy-admin-host input,
.legacy-admin-host select,
.legacy-admin-host textarea {
  background: var(--bg3);
  border: 1px solid var(--b);
  color: var(--t);
  padding: 10px 12px;
  width: 100%;
  margin-bottom: 10px;
  font-size: 13px;
  border-radius: 6px;
  outline: none;
  transition: border .15s;
}
.legacy-admin-host input:focus,
.legacy-admin-host select:focus,
.legacy-admin-host textarea:focus { border-color: var(--a); }
.legacy-admin-host label {
  font-size: 11px;
  color: var(--td);
  display: block;
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: .5px;
}
.legacy-admin-host h2,
.legacy-admin-host h3,
.legacy-admin-host h4 { margin: 0 0 12px; }
.legacy-admin-host p { line-height: 1.5; }
.legacy-admin-host .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.legacy-admin-host .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.legacy-admin-host .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.legacy-admin-host .btn-row { display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
.legacy-admin-host .action-btn {
  background: var(--a);
  color: #000;
  border: none;
  padding: 8px 16px;
  font-weight: 600;
  cursor: pointer;
  border-radius: 6px;
  font-size: 13px;
  transition: .15s;
  width: auto;
  margin-bottom: 0;
}
.legacy-admin-host .action-btn:hover { opacity: .9; }
.legacy-admin-host .save-btn { background: var(--g); }
.legacy-admin-host .edit-btn {
  background: var(--bg2);
  color: var(--t);
  border: 1px solid var(--b);
  padding: 5px 12px;
  cursor: pointer;
  font-size: 12px;
  border-radius: 4px;
  width: auto;
  margin-bottom: 0;
}
.legacy-admin-host .edit-btn:hover { border-color: var(--a); color: var(--a); }
.legacy-admin-host .del-btn {
  background: transparent;
  color: var(--r);
  border: 1px solid rgba(248,81,73,.3);
  padding: 5px 12px;
  cursor: pointer;
  font-size: 12px;
  border-radius: 4px;
  width: auto;
  margin-bottom: 0;
}
.legacy-admin-host .del-btn:hover { background: rgba(248,81,73,.1); }
.legacy-admin-host .tag { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
.legacy-admin-host .tag-green { background: rgba(63,185,80,.15); color: var(--g); }
.legacy-admin-host .tag-red { background: rgba(248,81,73,.15); color: var(--r); }
.legacy-admin-host .tag-purple { background: rgba(187,134,252,.15); color: var(--a); }
.legacy-admin-host .tag-yellow { background: rgba(210,153,34,.15); color: var(--y); }
.legacy-admin-host code { background: var(--bg2); padding: 2px 6px; border-radius: 4px; font-size: 12px; }
.legacy-admin-host .error { color: var(--r); }
.legacy-admin-host .success { color: var(--g); }
.legacy-admin-host #dynamicArea { min-height: 420px; }
@media (max-width: 980px) {
  .legacy-admin-host .grid-4,
  .legacy-admin-host .grid-3,
  .legacy-admin-host .grid-2 {
    grid-template-columns: 1fr;
  }
  .legacy-admin-topbar {
    padding: 16px;
  }
  .legacy-admin-workspace {
    padding: 16px;
  }
}
`

declare global {
  interface Window {
    __TE_ADMIN_BOOT_PROMISE__?: Promise<void>
    __TE_ADMIN_RUNTIME_READY__?: boolean
    __TE_ADMIN_RUNTIME__?: {
      load: (key: string, emitChange?: boolean) => void
    }
    __TE_ADMIN_LOAD_MANAGER__?: (key: string, emitChange?: boolean) => void
    loadManager?: (key: string, emitChange?: boolean) => void
  }
}

function loadScriptOnce(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-te-admin-src="${src}"]`)

    if (existing) {
      if (existing.dataset.loaded === "1") {
        resolve()
        return
      }

      existing.addEventListener("load", () => resolve(), { once: true })
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true })
      return
    }

    const script = document.createElement("script")
    script.src = src
    script.async = false
    script.defer = false
    script.dataset.teAdminSrc = src
    script.addEventListener("load", () => {
      script.dataset.loaded = "1"
      resolve()
    }, { once: true })
    script.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true })
    document.body.appendChild(script)
  })
}

function injectBridgeScriptOnce() {
  return new Promise<void>((resolve) => {
    if (window.__TE_ADMIN_RUNTIME_READY__) {
      resolve()
      return
    }

    const existing = document.querySelector<HTMLScriptElement>("script[data-te-admin-bridge='1']")
    if (existing) {
      resolve()
      return
    }

    const script = document.createElement("script")
    script.dataset.teAdminBridge = "1"
    script.text = LEGACY_BRIDGE_SOURCE
    document.body.appendChild(script)
    resolve()
  })
}

async function bootLegacyRuntime() {
  if (window.__TE_ADMIN_BOOT_PROMISE__) {
    return window.__TE_ADMIN_BOOT_PROMISE__
  }

  window.__TE_ADMIN_BOOT_PROMISE__ = (async () => {
    for (const src of LEGACY_SCRIPT_PATHS) {
      await loadScriptOnce(src)
    }
    await injectBridgeScriptOnce()
  })()

  return window.__TE_ADMIN_BOOT_PROMISE__
}

interface LegacyAdminHostProps {
  managerKey: string
  onSectionChange?: (section: string) => void
}

export function LegacyAdminHost({ managerKey, onSectionChange }: LegacyAdminHostProps) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const title = useMemo(() => managerKey.replace(/_/g, " ").toUpperCase(), [managerKey])

  useEffect(() => {
    let cancelled = false

    bootLegacyRuntime()
      .then(() => {
        if (cancelled) return
        setReady(true)
        setError(null)
        window.__TE_ADMIN_LOAD_MANAGER__?.(managerKey, false)
      })
      .catch((err) => {
        console.error("Legacy Admin runtime boot failed:", err)
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Failed to boot legacy admin runtime.")
      })

    return () => {
      cancelled = true
    }
  }, [managerKey])

  useEffect(() => {
    const handleSectionChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ section?: string }>
      const section = customEvent.detail?.section
      if (section) {
        onSectionChange?.(section)
      }
    }

    window.addEventListener("te-admin-section-change", handleSectionChange as EventListener)
    return () => {
      window.removeEventListener("te-admin-section-change", handleSectionChange as EventListener)
    }
  }, [onSectionChange])

  return (
    <div className="legacy-admin-host">
      <style jsx global>{LEGACY_STYLES}</style>

      <div className="legacy-admin-shell">
        <div className="legacy-admin-topbar">
          <h1 id="pageTitle">{title}</h1>
          <p id="managerTitle">{ready ? "Legacy Admin runtime ready." : "Loading legacy AdminSauce modules…"}</p>
        </div>

        <div className="legacy-admin-workspace">
          {error ? (
            <div
              style={{
                border: "1px solid rgba(248,81,73,.35)",
                background: "rgba(248,81,73,.08)",
                color: "#f85149",
                borderRadius: 10,
                padding: 16,
              }}
            >
              <strong>Legacy Admin runtime failed to load.</strong>
              <div style={{ marginTop: 8 }}>{error}</div>
            </div>
          ) : !ready ? (
            <div
              style={{
                border: "1px solid #30363d",
                background: "#161b22",
                borderRadius: 10,
                padding: 16,
                color: "#6e7681",
              }}
            >
              Loading scripts and manager runtime…
            </div>
          ) : null}

          <div id="dynamicArea" />
          <div id="userInfo" style={{ display: "none" }} />
          <div id="sidebar" style={{ display: "none" }} />
        </div>
      </div>
    </div>
  )
}
