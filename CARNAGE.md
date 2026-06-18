# Twisted Carnage — game design brief

> The flagship RPG built on Twisted Engine. This document describes the
> GAME (lore, mechanics, monetization). For engineering rules and the
> data-driven engine schemas, see `AGENTS.md`.

## Pitch

**Twisted Carnage** is a dark Celtic-fantasy tabletop RPG that runs in
the browser. Free-to-play tabletop core with paid expansions. Acts as
the marketing showcase for the Twisted Engine (anyone who plays Carnage
can spin up their own game on the same engine).

## Setting

- **Tone:** Dark Celtic fantasy. Blood, bone, ogham-cut wood, peat smoke,
  iron rust. NOT Tolkien-bright. Think Mythic Ireland × Bloodborne ×
  early DnD.
- **Magic system:** Ogham runes. 25 standard Celtic oghams + 5 dark
  custom oghams (`Fuilteach` — blood, `Dorchadas` — darkness,
  `Cnead` — wail, `Gáirsiúil` — obscenity, `Bás` — death). Magic is
  unlocked one ogham at a time; spells require a combination of unlocked
  oghams to cast.
- **Resource:** `Anam` (Irish for "soul") = the mana/life-force pool
  spells draw from. Regens slowly out of combat. Death rituals,
  sacrifices, and ogham study refill it.
- **World canon:** TBD by user — this doc captures mechanical truth;
  named regions / factions / pantheon are not yet locked.

## Game modes

The engine supports multiple game-mode plugins. Carnage ships with:

1. **RPG (primary)** — turn-based party RPG, AI or human DM, persistent
   campaigns. The default experience.
2. **MOBA** — 5v5 plugin, optional. Released later.
3. **Asymmetric horror** — DBD-style "one hunter vs survivors" plugin,
   admin live-spectates. Released later.

When in doubt, build for RPG mode. Other modes are content forks, not
separate codebases.

## Combat ruleset (Carnage canon)

Carnage uses the **Planet Mado-inspired** tabletop ruleset as its
default — but every mechanic is TOGGLEABLE in `system_settings` so a
campaign can dial down to vanilla turn-based JRPG combat.

### Defense actions (resolved on incoming attacks)
- **Dodge** — within 5% of attacker's power = 15% chance; +35% per
  doubling of relative power; capped at 90%
- **Block** — roll d6 twice; rolls of 1 or 2 block with that arm.
  One arm = 25% damage reduction, both arms = 50%. Does NOT consume
  a turn.
- **Counter** — 25% base on energy blasts (+25% if charging). Equal
  power = mutual cancel. Cap 90%.

### Status / wound systems
- **Bleeds:** Light 3% max HP × 2 turns; Moderate 3% × 4; Heavy 5% × 5.
- **Stun:** -50% to dodge/block/counter chances.
- **Limb loss:** -20% max powerlevel per lost limb. Cannot use abilities
  requiring that limb. Healing spells can regrow limbs (gated).
- **KO vs kill:** Knocked-out opponents prompt an interrogation event —
  spare/recruit/execute/loot/question. Rewards are identical whether
  killed or spared (do not balance toward execution).
- **Surrender:** "I give up" command yields the fight; winner chooses
  fate.

### Damage modifiers
- **Crit:** 3% base on physical (not weapons). +50% damage.
- **Diminishing returns:** Same attack twice in a row → +5% dodge for
  opponent, capped at +15%. Ki/blast attacks have a baseline +15% dodge.
- **Combos:** Physical attacks have a hidden combo chance — lower
  damage = higher combo chance. Player-facing details intentionally
  obscured.
- **Flavor text RP bonus:** Player-described attacks get +5-10% damage.
  Optional, toggleable per-campaign.

### Action economy
- Initiative modes (configurable per-campaign): **speed-based** (default),
  **ATB** (FFIV-style gauges), **CTB** (FFX-style counters).
- Battles can run **inline** (BG3-style on the overworld map) or
  **transition** (classic JRPG scene cut). Selectable per-ruleset
  and overridable per-encounter.

## Characters

- **Creation:** ability scores + race + class + appearance + background
  + feat, all configured no-code via AdminSauce.
- **Races / classes:** Race-locked classes (specific classes only
  available to specific races). Canonical race + class lists are TBD —
  the engine supports them, the Carnage canon is being authored.
- **Greet system:** Character names are hidden from other players
  until greeted. Toggleable per-campaign (Planet Mado-style rulesets
  may turn it off).
- **Death + respawn:** Characters have a `respawn_map_id` / x / y.
  Hardcore campaigns can disable respawn entirely.

## DM modes

Two ways to run a campaign:

1. **AI DM** — Anthropic Claude (or any opencode-configured provider)
   narrates encounters, generates loot, voices NPCs, adjudicates RP.
2. **Human DM** — a designated admin runs the session live with map
   controls (lock movement, teleport players, spawn NPCs, force
   battles, trigger screen effects).

Both modes share the same channel infrastructure and battle engine.

## Monetization (Carnage-specific — for engine pricing see `AGENTS.md` references)

| SKU | Price | Notes |
|---|---|---|
| Free-to-play | $0 | Tabletop browser, limited content |
| Founder Pack | $30 | Kickstarter-only. Base game + Year 1 expansions + 50% lifetime DLC discount (NOT "lifetime expansions" — explicitly avoided as a KS trap) |
| Premium | $5/mo | Cosmetics + MOBA/DBD modes. HOLD until 5k MAU |
| Season Pass | $15/quarter | Battle-pass progression, tournament eligibility |
| Cosmetic store | varies | Skins/mounts/hideout. **Explicit no pay-to-win** |

**Hard rule:** Carnage never sells stat advantages. Cosmetic-only and
content-gated only. Premium unlocks game modes and expansion content,
never raw power.

## What "shipping Carnage" means

In priority order:

1. **Tabletop core works end-to-end** — character creation, one starter
   map, basic combat, save/load, AI DM running a short adventure.
2. **A starter region's content** — 5-10 maps, ~30 NPCs, 2-3 dungeons,
   a main quest line of 5-10 hours.
3. **Multiplayer party** — 4 players in the same campaign, shared
   inventory/quest state, voice optional.
4. **Kickstarter assets** — playable demo build, trailer, Founder Pack
   page, tier ladder live.

Anything not on this list is post-launch. Especially: MOBA mode, DBD
mode, season pass infrastructure, cosmetic store, Premium subscription.
Those exist as plumbing in the engine but are NOT Carnage v1 ship
blockers.

## Things to ask the user about, not invent

If you need to author content or make a creative call, ASK rather than
making it up. Known unspecified:

- Canonical race + class names
- World region names + map of the starter zone
- Named NPCs (allies, antagonists, vendors)
- Main quest spine
- Pantheon / cosmology
- House rules / faction names

The user is the lore authority. The engine just executes what they
define.
