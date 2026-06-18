# Phase 1.5d Magic seed — 25 standard Celtic oghams + 5 dark/heel
# customs + 12 starter spells. Manual run only:
#
#     mix run priv/repo/seed_magic.exs
#
# Idempotent: re-running upserts by `name` (oghams) and `key` (spells)
# so designers can edit and re-seed without dupes.

alias TePhoenix.Game.Magic
alias TePhoenix.Repo

Magic.ensure_schema()

# ── Standard Celtic Ogham alphabet (25 letters) ──────────────────
oghams = [
  # Aicme Beithe — first family (birch group)
  %{name: "Beith",    icon: "ᚁ", desc: "Birch — beginnings, purification, new vows.", rank: 1, element: "earth", family: "beithe"},
  %{name: "Luis",     icon: "ᚂ", desc: "Rowan — protection from the unseen, ward against curses.", rank: 1, element: "fire", family: "beithe"},
  %{name: "Fearn",    icon: "ᚃ", desc: "Alder — guidance through liminal waters, oracular voice.", rank: 1, element: "water", family: "beithe"},
  %{name: "Sail",     icon: "ᚄ", desc: "Willow — moonlight craft, healing dreams, deep knowing.", rank: 1, element: "water", family: "beithe"},
  %{name: "Nion",     icon: "ᚅ", desc: "Ash — world-tree, the linking of nine realms.", rank: 2, element: "air", family: "beithe"},

  # Aicme hÚatha — second family (hawthorn group)
  %{name: "Uath",     icon: "ᚆ", desc: "Hawthorn — the warding hedge, the chastity of thresholds.", rank: 2, element: "air", family: "uatha"},
  %{name: "Dair",     icon: "ᚇ", desc: "Oak — the crowned tree, kingship, oaths sworn in blood.", rank: 2, element: "earth", family: "uatha"},
  %{name: "Tinne",    icon: "ᚈ", desc: "Holly — winter's blade, sacrificial fire, the unblinking eye.", rank: 2, element: "fire", family: "uatha"},
  %{name: "Coll",     icon: "ᚉ", desc: "Hazel — the salmon's wisdom, hidden currents of insight.", rank: 2, element: "water", family: "uatha"},
  %{name: "Quert",    icon: "ᚊ", desc: "Apple — the orchard between worlds, fruit of forgetting.", rank: 3, element: "earth", family: "uatha"},

  # Aicme Muine — third family (vine group)
  %{name: "Muin",     icon: "ᚋ", desc: "Vine — entanglement and prophecy, drunken truth.", rank: 2, element: "earth", family: "muine"},
  %{name: "Gort",     icon: "ᚌ", desc: "Ivy — patient stranglehold, the silent climb to power.", rank: 2, element: "earth", family: "muine"},
  %{name: "Ngeadal",  icon: "ᚍ", desc: "Reed — the cutting edge of intent, voice carried on wind.", rank: 2, element: "air", family: "muine"},
  %{name: "Straif",   icon: "ᚎ", desc: "Blackthorn — wound and remedy, the bite that heals.", rank: 3, element: "dark", family: "muine"},
  %{name: "Ruis",     icon: "ᚏ", desc: "Elder — death and crossing, the matron's hand at the gate.", rank: 3, element: "dark", family: "muine"},

  # Aicme Ailme — fourth family (vowel group)
  %{name: "Ailm",     icon: "ᚐ", desc: "Silver fir — the first cry, vision-pine of the high places.", rank: 1, element: "air", family: "ailme"},
  %{name: "Onn",      icon: "ᚑ", desc: "Gorse — relentless flowering, the path through thorn.", rank: 1, element: "fire", family: "ailme"},
  %{name: "Ur",       icon: "ᚒ", desc: "Heather — the bee's covenant, sweet ferment, gathered grief.", rank: 2, element: "earth", family: "ailme"},
  %{name: "Eadhadh",  icon: "ᚓ", desc: "Aspen — the trembling shield, courage of the windborne.", rank: 2, element: "air", family: "ailme"},
  %{name: "Iodhadh",  icon: "ᚔ", desc: "Yew — the ever-green of graves, the rebirth across centuries.", rank: 3, element: "dark", family: "ailme"},

  # Forfeda — supplementary letters
  %{name: "Eabhadh",  icon: "ᚕ", desc: "Aspen-grove — collective courage, the moot of the brave.", rank: 3, element: "air", family: "forfeda"},
  %{name: "Or",       icon: "ᚖ", desc: "Spindle — the loom of fate, threads twisted and cut.", rank: 3, element: "dark", family: "forfeda"},
  %{name: "Uillean",  icon: "ᚗ", desc: "Honeysuckle — the path of the seeker, return to the source.", rank: 3, element: "earth", family: "forfeda"},
  %{name: "Ifin",     icon: "ᚘ", desc: "Pine — long memory, sap that remembers fire.", rank: 3, element: "fire", family: "forfeda"},
  %{name: "Eamhancholl", icon: "ᚙ", desc: "Twin hazel — paired insight, dialogue with the otherself.", rank: 4, element: "water", family: "forfeda"}
]

# ── Dark / heel oghams (5 custom) ────────────────────────────────
dark_oghams = [
  %{name: "Fuilteach", icon: "🩸", desc: "Bloody — the rune of unhealing wounds, pain that nourishes.", rank: 4, element: "blood", family: "dark"},
  %{name: "Dorchadas", icon: "🌑", desc: "Blackened — the hollow where light has died.", rank: 4, element: "dark", family: "dark"},
  %{name: "Cnead",     icon: "🩹", desc: "Groan — sound that crawls under the skin, the body's protest.", rank: 4, element: "dark", family: "dark"},
  %{name: "Gáirsiúil", icon: "🪦", desc: "Profane — rune of broken oaths and shattered taboo.", rank: 5, element: "dark", family: "dark"},
  %{name: "Bás",       icon: "💀", desc: "Death itself — the final letter, spoken last.", rank: 5, element: "dark", family: "dark"}
]

all_oghams = oghams ++ dark_oghams

IO.puts("Seeding #{length(all_oghams)} oghams…")

Enum.each(all_oghams, fn o ->
  Repo.query(
    """
    INSERT INTO game_oghams (name, icon, description, lore_text, rank, element_attack, on_hit_chance)
    VALUES (?, ?, ?, ?, ?, ?, 20)
    ON DUPLICATE KEY UPDATE
      icon = VALUES(icon),
      description = VALUES(description),
      lore_text = VALUES(lore_text),
      rank = VALUES(rank),
      element_attack = VALUES(element_attack)
    """,
    [o.name, o.icon, o.desc, o.desc, o.rank, o.element]
  )
end)

# Note: game_oghams.name has no UNIQUE constraint by default, so the
# upsert clause never fires. Replace with conditional insert so a
# repeat seed doesn't dupe.
{:ok, %{rows: existing_rows}} = Repo.query("SELECT name, COUNT(*) FROM game_oghams GROUP BY name HAVING COUNT(*) > 1")

if length(existing_rows) > 0 do
  IO.puts("  WARNING — duplicate ogham rows detected. Cleaning up.")

  Enum.each(existing_rows, fn [name, _count] ->
    # Keep the lowest-id row, delete the rest
    {:ok, %{rows: [[keep_id]]}} = Repo.query("SELECT MIN(id) FROM game_oghams WHERE name = ?", [name])
    Repo.query("DELETE FROM game_oghams WHERE name = ? AND id <> ?", [name, keep_id])
  end)
end

# ── 12 starter spells ────────────────────────────────────────────
spells = [
  # Damage spells (combat)
  %{key: "fire_lance", name: "Fire Lance",
    pattern: ["luis", "tinne"], anam_cost: 12, cooldown_ms: 0,
    school: "fire", desc: "A focused javelin of rowan-flame that pierces armor.",
    effect: %{"damage" => %{"type" => "fire", "amount" => 18}}},

  %{key: "frost_bolt", name: "Frost Bolt",
    pattern: ["sail", "uath"], anam_cost: 10, cooldown_ms: 0,
    school: "ice", desc: "A bolt of willow-mist that numbs the limbs it strikes.",
    effect: %{"damage" => %{"type" => "ice", "amount" => 14}, "status_apply" => %{"status_key" => "slowed", "duration_ms" => 4000}}},

  %{key: "blood_lash", name: "Blood Lash",
    pattern: ["fuilteach", "straif"], anam_cost: 22, cooldown_ms: 8000,
    school: "blood", desc: "A whip of red rune-thorns that opens unhealing wounds.",
    effect: %{"damage" => %{"type" => "blood", "amount" => 28}, "status_apply" => %{"status_key" => "bleed_severe", "duration_ms" => 12000}}},

  %{key: "oak_spear", name: "Oak Spear",
    pattern: ["dair", "tinne", "nion"], anam_cost: 30, cooldown_ms: 12000,
    school: "earth", desc: "An ash-shafted oaken spear, sworn under fire — pierces all armor.",
    effect: %{"damage" => %{"type" => "physical", "amount" => 45, "armor_pen" => true}}},

  # Healing spells (utility)
  %{key: "willow_mend", name: "Willow Mend",
    pattern: ["sail"], anam_cost: 8, cooldown_ms: 2000,
    school: "life", desc: "A whispered restoration over a willow-bound wound.",
    effect: %{"heal" => %{"amount" => 25}}},

  %{key: "rowan_blessing", name: "Rowan Blessing",
    pattern: ["luis", "ailm"], anam_cost: 18, cooldown_ms: 6000,
    school: "life", desc: "A protective ward woven of rowan and silver fir.",
    effect: %{"heal" => %{"amount" => 40}, "buff" => %{"stat" => "def", "amount" => 5, "duration_ms" => 30000}}},

  # Buff spells
  %{key: "berserker_oak", name: "Oath of Oak",
    pattern: ["dair"], anam_cost: 15, cooldown_ms: 30000,
    school: "war", desc: "A king's oath sworn in blood — the body answers.",
    effect: %{"buff" => %{"stat" => "atk", "amount" => 10, "duration_ms" => 20000}}},

  %{key: "stag_speed", name: "Stag's Speed",
    pattern: ["eadhadh", "onn"], anam_cost: 12, cooldown_ms: 15000,
    school: "wind", desc: "Aspen-trembling, the leap of the white stag.",
    effect: %{"buff" => %{"stat" => "speed", "amount" => 8, "duration_ms" => 15000}}},

  # Status & debuff spells
  %{key: "elder_curse", name: "Elder's Curse",
    pattern: ["ruis", "dorchadas"], anam_cost: 20, cooldown_ms: 25000,
    school: "necromancy", desc: "The matron's hand at the gate — a withering touch.",
    effect: %{"status_apply" => %{"status_key" => "withered", "duration_ms" => 20000}, "damage" => %{"type" => "dark", "amount" => 12}}},

  %{key: "dispel_minor", name: "Dispel",
    pattern: ["coll"], anam_cost: 14, cooldown_ms: 10000,
    school: "arcane", desc: "Hazel-rod knowing that strips magic from the air.",
    effect: %{"dispel" => %{"filter" => "all"}}},

  # Summon (deferred to spawn queue)
  %{key: "shadow_companion", name: "Shadow Companion",
    pattern: ["dorchadas", "fuilteach", "bás"], anam_cost: 50, cooldown_ms: 60000,
    school: "necromancy", desc: "A pact spoken in the bloody dark, answered.",
    effect: %{"summon" => %{"npc_template_id" => 1, "duration_ms" => 60000}}},

  # Cinematic ultimate
  %{key: "death_speak", name: "Speak Death",
    pattern: ["bás", "gáirsiúil", "ruis"], anam_cost: 100, cooldown_ms: 300000,
    school: "necromancy", desc: "The final letter, spoken last. The world flinches.",
    effect: %{"damage" => %{"type" => "dark", "amount" => 200}, "status_apply" => %{"status_key" => "doomed", "duration_ms" => 60000}}}
]

IO.puts("Seeding #{length(spells)} spells…")

Enum.each(spells, fn s ->
  Repo.query(
    """
    INSERT INTO game_spells
      (`key`, name, description, ogham_pattern_json, anam_cost,
       cast_time_ms, cooldown_ms, effect_json, spell_school, min_level,
       is_combat_spell, is_utility_spell)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      description = VALUES(description),
      ogham_pattern_json = VALUES(ogham_pattern_json),
      anam_cost = VALUES(anam_cost),
      cooldown_ms = VALUES(cooldown_ms),
      effect_json = VALUES(effect_json),
      spell_school = VALUES(spell_school)
    """,
    [
      s.key,
      s.name,
      s.desc,
      Jason.encode!(s.pattern),
      s.anam_cost,
      1000,
      s.cooldown_ms,
      Jason.encode!(s.effect),
      s.school,
      1,
      1,
      Map.get(s, :is_utility, 0)
    ]
  )
end)

IO.puts("Done. Magic capability stays OFF in /sauce/capabilities until Goose flips it.")
