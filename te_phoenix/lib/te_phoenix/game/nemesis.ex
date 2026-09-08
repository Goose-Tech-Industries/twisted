defmodule TePhoenix.Game.Nemesis do
  @moduledoc """
  Living Nemesis & Faction Memory Engine (inspired by Middle-earth: Shadow of Mordor / War).

  Tracks recurring adversary commanders that:
  - Survive or flee encounters, gain permanent battle scars (e.g., "Melted Cheek", "Charred Arm"),
    level up, gain resistances, and nurse intense personal grudges against the player.
  - Ambush the party in the wild or during camp rest with procedural voice taunts.
  - Advance in rank and power if they defeat the player.
  - Belong to 4 dynamic world factions whose standings shift according to player actions:
    * The Iron Vanguard (Martial order, disciplined steel)
    * The Blackbriar Syndicate (Underworld rogues, shadow contracts, poisons)
    * The Moonveil Coven (Esoteric arcanists, astral weave manipulation)
    * The Ashfall Cult (Apocalyptic zealots, fanatical flame)
  """

  alias TePhoenix.Repo
  require Logger

  @factions %{
    "iron_vanguard" => %{
      "key" => "iron_vanguard",
      "name" => "Iron Vanguard",
      "title" => "Fortress Sentinels",
      "icon" => "🛡️",
      "color" => "#3b82f6",
      "standing" => 10,
      "description" => "Martial legion upholding absolute order through heavy armor and disciplined steel."
    },
    "blackbriar_syndicate" => %{
      "key" => "blackbriar_syndicate",
      "name" => "Blackbriar Syndicate",
      "title" => "Shadow Brokers",
      "icon" => "🗡️",
      "color" => "#10b981",
      "standing" => 0,
      "description" => "Covert underworld syndicate dealing in contraband, poison, and whispered contracts."
    },
    "moonveil_coven" => %{
      "key" => "moonveil_coven",
      "name" => "Moonveil Coven",
      "title" => "Astral Weavers",
      "icon" => "🔮",
      "color" => "#8b5cf6",
      "standing" => 5,
      "description" => "Esoteric circle of sorcerers studying forbidden planar rifts and ancient enchantments."
    },
    "ashfall_cult" => %{
      "key" => "ashfall_cult",
      "name" => "Ashfall Cult",
      "title" => "Flame Zealots",
      "icon" => "🔥",
      "color" => "#ef4444",
      "standing" => -25,
      "description" => "Fanatical cabal seeking divine rebirth through apocalyptic fire and volcanic ruin."
    }
  }

  @possible_scars [
    %{name: "Charred Torso Carapace", element: "fire", limb: :torso, trait: "Fire-Forged Carapace", desc: "Burn scars covering half their torso; resistant to flame."},
    %{name: "Frostbitten Visage", element: "ice", limb: :head, trait: "Glacial Resolve", desc: "Skin blackened by magical frost; immune to chill and slow."},
    %{name: "Conductive Arc-Burns", element: "lightning", limb: :torso, trait: "Grounded Flesh", desc: "Veins glowing faintly with lightning scars; dampens shock damage."},
    %{name: "Acid-Pitted Armor", element: "acid", limb: :torso, trait: "Corrosion Resilient", desc: "Plate etched and melted by caustic fluids; hardened against rot."},
    %{name: "Gouged Eye", element: "physical", limb: :head, trait: "Single-Minded Fury", desc: "Lost an eye in brutal melee; +20% Critical Strike chance."},
    %{name: "Prosthetic Iron Claw", element: "physical", limb: :r_arm, trait: "Barbed Swipe", desc: "Severed sword arm replaced with a serrated iron claw."},
    %{name: "Severed Shield-Arm", element: "physical", limb: :l_arm, trait: "Vanguard Spite", desc: "Left arm amputated at elbow; uses buckler chained to shoulder."},
    %{name: "Peg Leg of Ironwood", element: "physical", limb: :l_leg, trait: "Stomping Tremor", desc: "Crushed knee replaced by runic ironwood; slams ground to stagger foes."},
    %{name: "Shattered Skull Plate", element: "physical", limb: :head, trait: "Berserker Rage", desc: "Fractured skull clamped with riveted steel; ignores pain."},
    %{name: "Prosthetic Iron Jaw", element: "physical", limb: :head, trait: "Iron-Bite Taunt", desc: "Crushed jaw replaced by jagged iron; lowers party morale on ambush."},
    %{name: "Shattered Horn", element: "physical", limb: :head, trait: "Vengeful Frenzy", desc: "A severed demon horn replaced with runic spikes; hits harder when low HP."}
  ]

  @possible_traits [
    "Vengeful Strike", "Blood Frenzy", "Shadow Ambush", "No Escape",
    "Iron Will", "Spellbreaker", "Sadistic Cleave", "Pyromaniac"
  ]

  # ── Public API ──────────────────────────────────────────────────

  @doc "Fetch the complete Nemesis and Factions dossier for a character"
  def get_dossier(char_id) do
    state_data = load_character_state(char_id)

    roster = Map.get(state_data, "nemesis_roster") || default_nemesis_roster()
    factions = Map.get(state_data, "factions") || @factions

    # Enrich factions with current tier details
    enriched_factions =
      Enum.map(factions, fn {_key, data} ->
        standing = Map.get(data, "standing", 0)
        tier_info = calculate_standing_tier(standing)
        Map.merge(data, %{"tier_info" => tier_info})
      end)

    %{
      char_id: char_id,
      nemeses: roster,
      factions: enriched_factions
    }
  end

  @doc "Generate a new procedural Nemesis adversary"
  def generate_nemesis(archetype \\ nil, opts \\ %{}) do
    arch = archetype || Enum.random(["warrior", "assassin", "pyromancer", "inquisitor"])
    level = Map.get(opts, :level, 3)

    {name, title, faction} = case arch do
      "warrior" ->
        {Enum.random(["Kragthor", "Vorgoth", "Iron-Jaw Bran", "Gorag"]),
         Enum.random(["the Cleaver", "the Shield-Breaker", "the Undaunted"]),
         "iron_vanguard"}
      "assassin" ->
        {Enum.random(["Vespera", "Nyx", "Silas", "Corvus"]),
         Enum.random(["the Whispering Blade", "Night-Stalker", "the Ghost"]),
         "blackbriar_syndicate"}
      "pyromancer" ->
        {Enum.random(["Ignis", "Malakor", "Ash-Caller Vora", "Brand"]),
         Enum.random(["the Flame-Wreathed", "of the Cinder Pyre", "the Fire-Drinker"]),
         "ashfall_cult"}
      "inquisitor" ->
        {Enum.random(["Valerius", "Aurelius", "Morrigan", "Sister Judith"]),
         Enum.random(["the Arcanist", "of the Astral Veil", "the Unforgiving"]),
         "moonveil_coven"}
    end

    %{
      "id" => "nem_#{:os.system_time(:millisecond)}_#{:rand.uniform(9999)}",
      "name" => "#{name} #{title}",
      "title" => title,
      "archetype" => arch,
      "faction" => faction,
      "level" => level,
      "grudge_level" => 1,
      "status" => "active", # active | escaped | slain
      "scars" => [],
      "traits" => [Enum.random(@possible_traits)],
      "kills_on_player" => 0,
      "escapes_from_player" => 0,
      "encounters_count" => 1,
      "voice_style" => arch,
      "living_dialogue" => %{
        "ambush" => "#{name}: 'You thought you could leave me in the dirt? I carved my way out just to slit your throat!'",
        "wounded" => "#{name}: 'Pain is an old friend! I will break your bones for this!'",
        "defeat_player" => "#{name}: 'Look at you now! Pathetic! I will take your ears as trophies!'",
        "escape" => "#{name}: 'This isn't over! Next time, I bring an army!'"
      }
    }
  end

  @doc """
  Record an encounter outcome with a nemesis:
  - :escaped (survives, gains scar, increases grudge, levels up)
  - :player_defeated (kills player, promoted, gains title & stats)
  - :executed (player executes nemesis, slain status, drops faction relic)
  """
  def record_encounter(char_id, nemesis_id, outcome, details \\ %{}) do
    state_data = load_character_state(char_id)
    roster = Map.get(state_data, "nemesis_roster") || default_nemesis_roster()
    factions = Map.get(state_data, "factions") || @factions

    {updated_roster, updated_factions, event_log} =
      case Enum.find(roster, &(&1["id"] == nemesis_id)) do
        nil ->
          {roster, factions, "Nemesis not found in dossier."}

        nemesis ->
          damage_type = Map.get(details, :element) || Map.get(details, "element") || "physical"
          target_limb = Map.get(details, :target_limb) || Map.get(details, "target_limb")
          map_id = Map.get(details, :map_id) || Map.get(details, "map_id")
          pos_x = Map.get(details, :x) || Map.get(details, "x")
          pos_y = Map.get(details, :y) || Map.get(details, "y")

          # Environmental destructible terrain hook
          env_destruction_log =
            if map_id && pos_x && pos_y do
              dt_atom = case String.downcase(to_string(damage_type)) do
                "fire" -> :fire
                "ice" -> :ice
                "lightning" -> :lightning
                "explosion" -> :explosion
                "acid" -> :fire
                _ -> :explosion
              end

              map_state = %{map_id: map_id, modified_by: char_id}
              case TePhoenix.World.DestructibleTerrain.destroy_tile(map_state, pos_x, pos_y, dt_atom) do
                {:ok, _tile, surface} ->
                  surf_text = if surface, do: " leaving an active #{surface} surface on the soil", else: ""
                  " 💥 The violence tore the terrain at (#{pos_x}, #{pos_y})#{surf_text}!"
                _ ->
                  ""
              end
            else
              ""
            end

          case outcome do
            o when o in [:escaped, "escaped", :survived, "survived"] ->
              new_scar = choose_scar(damage_type, target_limb)
              new_grudge = min(5, (nemesis["grudge_level"] || 1) + 1)
              new_escapes = (nemesis["escapes_from_player"] || 0) + 1
              new_level = (nemesis["level"] || 1) + 1
              new_trait = Enum.random(@possible_traits -- (nemesis["traits"] || []))
              disabled_limbs = Enum.uniq([new_scar.limb | (nemesis["disabled_limbs"] || [])])

              updated_nemesis =
                nemesis
                |> Map.put("grudge_level", new_grudge)
                |> Map.put("escapes_from_player", new_escapes)
                |> Map.put("level", new_level)
                |> Map.put("status", "active")
                |> Map.put("scars", Enum.uniq([new_scar | (nemesis["scars"] || [])]))
                |> Map.put("traits", Enum.uniq([new_trait | (nemesis["traits"] || [])]))
                |> Map.put("disabled_limbs", disabled_limbs)
                |> update_grudge_dialogue(new_scar["name"], new_scar.limb, new_grudge)

              # Shifting faction standings
              faction_key = nemesis["faction"]
              fac = Map.get(factions, faction_key, %{"standing" => 0})
              updated_fac = Map.put(fac, "standing", max(-100, Map.get(fac, "standing", 0) - 10))
              new_factions = Map.put(factions, faction_key, updated_fac)

              log_msg = "⚔️ #{nemesis["name"]} fled the battlefield! They sustained #{new_scar["name"]} (Limb: #{new_scar.limb}), reached Grudge Level #{new_grudge}, and swore blood vengeance!#{env_destruction_log}"
              {[updated_nemesis | List.delete(roster, nemesis)], new_factions, log_msg}

            o when o in [:player_defeated, "player_defeated"] ->
              new_kills = (nemesis["kills_on_player"] || 0) + 1
              new_level = (nemesis["level"] || 1) + 2
              promoted_title = "#{nemesis["title"]} (Slayer of Heroes)"
              updated_nemesis =
                nemesis
                |> Map.put("kills_on_player", new_kills)
                |> Map.put("level", new_level)
                |> Map.put("title", promoted_title)
                |> Map.put("status", "active")

              log_msg = "💀 #{nemesis["name"]} struck down the player! They were promoted to #{promoted_title} (Lvl #{new_level})!#{env_destruction_log}"
              {[updated_nemesis | List.delete(roster, nemesis)], factions, log_msg}

            o when o in [:executed, "executed", :slain, "slain"] ->
              # Executions leave heavy craters if coordinates are available
              aoe_log =
                if map_id && pos_x && pos_y do
                  map_state = %{map_id: map_id, modified_by: char_id}
                  TePhoenix.World.DestructibleTerrain.apply_aoe_destruction(map_state, pos_x, pos_y, 1, :explosion)
                  " The fatal blow cratered the earth around (#{pos_x}, #{pos_y})!"
                else
                  ""
                end

              updated_nemesis = Map.put(nemesis, "status", "slain")

              # Shift faction standings: Nemesis faction hates player (-15), opposing factions cheer (+20)
              nem_faction = nemesis["faction"]
              new_factions =
                Enum.reduce(factions, %{}, fn {k, f}, acc ->
                  curr = Map.get(f, "standing", 0)
                  new_std =
                    if k == nem_faction do
                      max(-100, curr - 15)
                    else
                      min(100, curr + 10)
                    end
                  Map.put(acc, k, Map.put(f, "standing", new_std))
                end)

              log_msg = "🏆 You executed #{nemesis["name"]}! The realm remembers your deed, and opposing factions praise your valor.#{aoe_log}"
              {[updated_nemesis | List.delete(roster, nemesis)], new_factions, log_msg}
          end
      end

    updated_state =
      state_data
      |> Map.put("nemesis_roster", updated_roster)
      |> Map.put("factions", updated_factions)

    save_character_state(char_id, updated_state)

    %{
      success: true,
      log: event_log,
      nemeses: updated_roster,
      factions: updated_factions
    }
  end

  @doc "Adjust standing with a faction (-100 to +100)"
  def adjust_faction_standing(char_id, faction_key, delta) do
    state_data = load_character_state(char_id)
    factions = Map.get(state_data, "factions") || @factions

    case Map.get(factions, faction_key) do
      nil ->
        {:error, "Unknown faction: #{faction_key}"}

      fac ->
        current = Map.get(fac, "standing", 0)
        new_standing = Enum.max([-100, Enum.min([100, current + delta])])
        updated_fac = Map.put(fac, "standing", new_standing)
        updated_factions = Map.put(factions, faction_key, updated_fac)

        updated_state = Map.put(state_data, "factions", updated_factions)
        save_character_state(char_id, updated_state)

        {:ok, %{
          faction: faction_key,
          previous_standing: current,
          new_standing: new_standing,
          tier_info: calculate_standing_tier(new_standing)
        }}
    end
  end

  @doc "Check if a high-grudge Nemesis ambushes the party during travel or camp"
  def check_ambush(char_id, context \\ "wilds") do
    state_data = load_character_state(char_id)
    roster = Map.get(state_data, "nemesis_roster") || default_nemesis_roster()

    # Nemeses eligible for ambush: active and grudge_level >= 2
    candidates = Enum.filter(roster, fn n ->
      n["status"] == "active" and (n["grudge_level"] || 1) >= 2
    end)

    if candidates == [] do
      {:ok, :clear}
    else
      # Sort by grudge descending
      nemesis = Enum.max_by(candidates, &(&1["grudge_level"] || 1))
      ambush_quote =
        case context do
          "camp" ->
            "🔥 In the dead of night, twigs snap behind your campfire... #{nemesis["name"]} steps from the shadows! '#{get_in(nemesis, ["living_dialogue", "ambush"])}'"
          _ ->
            "⚡ An ambush! Out from the jagged crags springs #{nemesis["name"]}! '#{get_in(nemesis, ["living_dialogue", "ambush"])}'"
        end

      {:ambush, %{
        nemesis: nemesis,
        announcement: ambush_quote,
        context: context
      }}
    end
  end

  @doc "Calculate standing tier, perks, and trade multiplier"
  def calculate_standing_tier(standing) do
    cond do
      standing >= 60 ->
        %{tier: "Allied", icon: "💎", shop_mult: 0.80, perk: "Honorary High Commander (20% Shop Discount)"}
      standing >= 20 ->
        %{tier: "Friendly", icon: "🤝", shop_mult: 0.90, perk: "Trusted Ally (10% Shop Discount)"}
      standing >= -19 ->
        %{tier: "Neutral", icon: "⚖️", shop_mult: 1.00, perk: "Outsider (Standard Prices)"}
      standing >= -59 ->
        %{tier: "Suspicious", icon: "👁️", shop_mult: 1.25, perk: "Monitored Rogue (25% Price Penalty)"}
      true ->
        %{tier: "Hostile", icon: "☠️", shop_mult: 1.60, perk: "Kill On Sight (Merchants Refuse Trade)"}
    end
  end

  # ── Internal Helpers ────────────────────────────────────────────

  defp default_nemesis_roster do
    [
      %{
        "id" => "nem_valen_scarred",
        "name" => "Valen the Blood-Scarred",
        "title" => "Vanguard Executioner",
        "archetype" => "warrior",
        "faction" => "iron_vanguard",
        "level" => 4,
        "grudge_level" => 2,
        "status" => "active",
        "scars" => [
          %{name: "Gouged Eye", element: "physical", trait: "Single-Minded Fury", desc: "Lost his eye to your blade; seeks your head in return."}
        ],
        "traits" => ["Vengeful Strike", "Iron Will"],
        "kills_on_player" => 0,
        "escapes_from_player" => 1,
        "encounters_count" => 1,
        "living_dialogue" => %{
          "ambush" => "Valen: 'I kept the eye you cut out in a jar! Every night it stared at me, reminding me to hunt you down!'",
          "wounded" => "Valen: 'Steel against steel! You won't take my other eye, worm!'",
          "defeat_player" => "Valen: 'Another notch on my greatsword. Your party will mourn your cowardice!'",
          "escape" => "Valen: 'Sound the retreat! But know this—nowhere in Twisted is safe for you!'"
        }
      },
      %{
        "id" => "nem_morrigan_cinder",
        "name" => "Morrigan the Cinder Witch",
        "title" => "Pyre Harbinger",
        "archetype" => "pyromancer",
        "faction" => "ashfall_cult",
        "level" => 5,
        "grudge_level" => 3,
        "status" => "active",
        "scars" => [
          %{name: "Charred Flesh", element: "fire", trait: "Fire-Forged Carapace", desc: "Bathed in molten slag; laughs at fire."}
        ],
        "traits" => ["Pyromaniac", "Blood Frenzy"],
        "kills_on_player" => 1,
        "escapes_from_player" => 2,
        "encounters_count" => 3,
        "living_dialogue" => %{
          "ambush" => "Morrigan: 'Smell that? It's the scent of boiling blood! The ashes of your companions will feed the volcano!'",
          "wounded" => "Morrigan: 'Burn! BURN WITH ME!'",
          "defeat_player" => "Morrigan: 'Cinders to cinders, flesh to dust! Glory to the Ashfall!'",
          "escape" => "Morrigan: 'I dissolve into smoke! We will meet again when the skies rain fire!'"
        }
      }
    ]
  end

  defp choose_scar(elem, target_limb) do
    limb_atom = case target_limb do
      nil -> nil
      l when is_atom(l) -> l
      l when is_binary(l) ->
        case String.downcase(l) do
          "head" -> :head
          "torso" -> :torso
          "left_arm" -> :l_arm
          "right_arm" -> :r_arm
          "l_arm" -> :l_arm
          "r_arm" -> :r_arm
          "left_leg" -> :l_leg
          "right_leg" -> :r_leg
          "l_leg" -> :l_leg
          "r_leg" -> :r_leg
          "legs" -> :l_leg
          "arms" -> :r_arm
          _ -> nil
        end
    end

    matched_by_limb =
      if limb_atom do
        Enum.filter(@possible_scars, fn s -> s.limb == limb_atom end)
      else
        []
      end

    cond do
      matched_by_limb != [] ->
        Enum.find(matched_by_limb, fn s -> s.element == elem end) || Enum.random(matched_by_limb)

      true ->
        case Enum.find(@possible_scars, fn s -> s.element == elem end) do
          nil -> Enum.random(@possible_scars)
          scar -> scar
        end
    end
  end

  defp update_grudge_dialogue(nemesis, scar_name, scar_limb, _grudge) do
    dialogue = Map.get(nemesis, "living_dialogue", %{})
    limb_taunt = case scar_limb do
      :head -> "You cracked my skull open, butcher! This head scar reminds me of your blood!"
      :r_arm -> "You took my blade-arm, worm! The smith hammered this barbed claw into my scar tissue!"
      :l_arm -> "You severed my shield-arm! Now this arm scar drives me to wield double the blades!"
      :l_leg -> "You shattered my knee! This peg leg and leg scar still run fast enough to slaughter you!"
      :r_leg -> "My leg may be scarred ironwood now, but its stride will trample your corpse!"
      :torso -> "You burned straight to my ribs, butcher! This torso scar only fuels my vengeance!"
      _ -> "You gave me this #{scar_name}! Every scar only made me ten times deadlier!"
    end

    new_ambush = "#{nemesis["name"]}: '#{limb_taunt} Prepare to die!'"
    Map.put(nemesis, "living_dialogue", Map.put(dialogue, "ambush", new_ambush))
  end

  defp load_character_state(char_id) do
    case Repo.query("SELECT state_json FROM characters WHERE id = ?", [char_id]) do
      {:ok, %{rows: [[state_json]]}} when not is_nil(state_json) ->
        case Jason.decode(to_string(state_json)) do
          {:ok, map} when is_map(map) -> map
          _ -> %{}
        end
      _ ->
        %{}
    end
  rescue
    _ -> %{}
  end

  defp save_character_state(char_id, new_state) do
    Repo.query("UPDATE characters SET state_json = ? WHERE id = ?", [
      Jason.encode!(new_state),
      char_id
    ])
  rescue
    e -> Logger.warning("Failed to save nemesis state for #{char_id}: #{inspect(e)}")
  end
end
