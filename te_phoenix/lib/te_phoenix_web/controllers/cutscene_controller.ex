defmodule TePhoenixWeb.CutsceneController do
  @moduledoc """
  Handles Wilderness Camps, Town Inns, and SSE (Server-Sent Events) Streamed
  Cinematic Cutscenes that react to party composition, player background,
  visual traits (masks/scars), and companion affinity.
  """
  use TePhoenixWeb, :controller
  alias TePhoenix.Repo
  require Logger

  # ── CAMP STATUS & COMPANIONS ───────────────────────────────────────

  def camp_status(conn, %{"char_id" => char_id_param}) do
    user_id = conn.assigns[:user_id]
    char_id = to_int(char_id_param)

    case Repo.query(
      """
      SELECT c.id, c.name, c.level, c.current_hp, c.max_hp, c.current_mp, c.max_mp,
             c.visual_prompt, c.state_json, c.map_id,
             cl.name AS class_name, r.name AS race_name,
             bg.name AS bg_name, bg.bonus_str AS bg_bonus_str,
             bg.npc_reaction, bg.companion_reaction, bg.enemy_reaction
      FROM characters c
      LEFT JOIN game_classes cl ON c.class_id = cl.id
      LEFT JOIN game_races r ON c.race_id = r.id
      LEFT JOIN game_backgrounds bg ON c.background_id = bg.id
      WHERE c.id = ? AND c.user_id = ?
      """,
      [char_id, user_id]
    ) do
      {:ok, %{columns: cols, rows: [row]}} ->
        hero = Enum.zip(cols, row) |> Map.new()

        # Determine if current location is near a Town Inn or in the Wilderness
        map_id = hero["map_id"] || 1
        location_type = if map_id in [1, 2], do: "inn", else: "wilderness"
        inn_name = if location_type == "inn", do: "The Boar's Tusk Tavern", else: nil
        rest_cost = if location_type == "inn", do: 10, else: 0

        # Region, Biome & Dynamic Weather Resolution
        biome_data = resolve_biome_for_map(map_id)
        weather_data = TePhoenix.World.Weather.get_weather(map_id)

        # Parse saved visual traits or state_json
        state_data = parse_json(hero["state_json"])
        affinities = Map.get(state_data, "companion_affinities", %{})
        active_meal_buff = Map.get(state_data, "meal_buff")
        active_fusion = Map.get(state_data, "active_fusion")

        companions = get_party_companions(hero, affinities, biome_data[:key] || "forest")

        night_watch_options = [
          %{id: "none", name: "No Guard (Unattended Fire)", perk: "Normal Ambush Risk", icon: "💤"},
          %{id: "valerius", name: "Valerius (Iron Vigil)", perk: "-15% Ambush Risk, +10 Party Defense", icon: "⚔️"},
          %{id: "bram", name: "Bram (Keen Senses)", perk: "-20% Ambush Risk, Bonus Harvest Loot", icon: "🏹"},
          %{id: "lyra", name: "Lyra (Warding Sigil)", perk: "-15% Ambush Risk, Flare Stun Effect", icon: "🔮"}
        ]

        json(conn, %{
          success: true,
          location: location_type,
          inn_name: inn_name,
          rest_cost: rest_cost,
          biome: biome_data,
          weather: %{
            key: Map.get(weather_data, :key, "clear"),
            name: Map.get(weather_data, :name, "Clear Night"),
            icon: Map.get(weather_data, :icon, "🌙")
          },
          activeMealBuff: active_meal_buff,
          activeFusion: active_fusion,
          nightWatchOptions: night_watch_options,
          hero: %{
            id: hero["id"],
            name: hero["name"],
            race: hero["race_name"] || "Human",
            class: hero["class_name"] || "Warrior",
            background: hero["bg_name"] || "Outlander",
            hp: hero["current_hp"],
            max_hp: hero["max_hp"],
            mp: hero["current_mp"],
            max_mp: hero["max_mp"]
          },
          companions: companions
        })

      _ ->
        json(conn, %{success: false, message: "Character not found."})
    end
  end

  # ── SSE CUTSCENE STREAM ───────────────────────────────────────────

  def stream_cutscene(conn, params) do
    user_id = conn.assigns[:user_id]
    char_id = to_int(params["charId"] || params["char_id"] || 1)
    location_override = params["location"] || "campfire"

    # Fetch hero metadata for world-reaction
    hero = case Repo.query(
      """
      SELECT c.*, cl.name AS class_name, r.name AS race_name,
             bg.name AS bg_name, bg.companion_reaction
      FROM characters c
      LEFT JOIN game_classes cl ON c.class_id = cl.id
      LEFT JOIN game_races r ON c.race_id = r.id
      LEFT JOIN game_backgrounds bg ON c.background_id = bg.id
      WHERE c.id = ? AND c.user_id = ?
      """,
      [char_id, user_id]
    ) do
      {:ok, %{columns: cols, rows: [row]}} ->
        Enum.zip(cols, row) |> Map.new()
      _ ->
        %{"name" => "Traveler", "race_name" => "Human", "class_name" => "Warrior", "bg_name" => "Outlander"}
    end

    conn =
      conn
      |> put_resp_header("content-type", "text/event-stream")
      |> put_resp_header("cache-control", "no-cache")
      |> put_resp_header("connection", "keep-alive")
      |> put_resp_header("x-accel-buffering", "no")
      |> send_chunked(200)

    # Stream the cutscene events sequentially with cinematic delays
    stream_reactive_cutscene(conn, hero, location_override)
  end

  defp stream_reactive_cutscene(conn, hero, location) do
    hero_name = hero["name"] || "Hero"
    hero_bg = hero["bg_name"] || "Outlander"
    hero_class = hero["class_name"] || "Warrior"
    visual_prompt = to_string(hero["visual_prompt"] || "")

    is_masked = String.contains?(String.downcase(visual_prompt), "mask")
    has_scars = String.contains?(String.downcase(visual_prompt), "scar")

    # 1. Scene Setup Event
    stage_data = %{
      location: location,
      title: if(location == "inn", do: "Hearthside Council", else: "Embers of the Long Road"),
      ambient: if(location == "inn", do: "tavern_hearth", else: "crickets_campfire"),
      lighting: if(location == "inn", do: "candlelight_amber", else: "flickering_embers"),
      camp_attire: true
    }
    send_sse_event(conn, "stage", stage_data)
    Process.sleep(300)

    # 2. Cinematic Atmosphere Narrative
    narrative_chunks =
      if location == "inn" do
        [
          "The downstairs bustle of the tavern fades into a comforting, rhythmic murmur.",
          " A wide stone hearth crackles warmly, illuminating heavy oak beams and tapestry-draped walls.",
          " Stripped of dented plate armor and trail-stained greaves,",
          " your party reclines in loose linen doublets and travel robes, sharing flagons of mulled winter cider."
        ]
      else
        [
          "The night settles deep and still over the untamed forest.",
          " A circle of river stones cradles the roaring campfire, sending amber sparks drifting toward the cold constellations.",
          " Having unbuckled steel pauldrons and set down heavy weaponry,",
          " your companions gather close to the fire in quilted arming tunics and soft furs, listening to the crackling pine."
        ]
      end

    for chunk <- narrative_chunks do
      send_sse_event(conn, "narrative", %{text: chunk})
      Process.sleep(80)
    end
    send_sse_event(conn, "narrative_end", %{fullText: Enum.join(narrative_chunks, "")})
    Process.sleep(400)

    # 3. Multi-Speaker Ensemble Dialogue Beats
    # Beat 1: Valerius initiates the discussion
    beat1 =
      cond do
        is_masked ->
          %{
            step: 1,
            totalSteps: if(location == "inn", do: 4, else: 3),
            companionId: "valerius",
            speaker: "Valerius",
            portrait: "⚔️",
            emote: "emote-rest",
            body: "*Valerius watches you adjust your #{if is_masked, do: "face mask", else: "collar"} in the firelight.* \"Even by the fire, you keep your visage guarded, #{hero_name}. A wise habit on the frontier. Men who show too much of themselves rarely live to see gray hair.\""
          }

        has_scars ->
          %{
            step: 1,
            totalSteps: if(location == "inn", do: 4, else: 3),
            companionId: "valerius",
            speaker: "Valerius",
            portrait: "⚔️",
            emote: "emote-rest",
            body: "*Valerius sets down his whetstone and inspects his blade.* \"Today's skirmish was fierce. Those marks on your face caught the evening sun, #{hero_name}. A warrior's scars are a ledger of battles won—and lessons survived.\""
          }

        hero_bg == "Noble" ->
          %{
            step: 1,
            totalSteps: if(location == "inn", do: 4, else: 3),
            companionId: "valerius",
            speaker: "Valerius",
            portrait: "⚔️",
            emote: "emote-rest",
            body: "*Valerius sits tall, arms crossed over his gambeson.* \"The road does not honor titles, #{hero_name}. Yet you ride without complaint. Discipline like that is rare among highborn heirs.\""
          }

        true ->
          %{
            step: 1,
            totalSteps: if(location == "inn", do: 4, else: 3),
            companionId: "valerius",
            speaker: "Valerius",
            portrait: "⚔️",
            emote: "emote-rest",
            body: "*Valerius wipes down his arming sword with an oiled cloth.* \"We made good ground today. But the scouts warn that the mountain passes are crawling with scouts. When the clash comes, our discipline must not falter.\""
          }
      end

    send_sse_event(conn, "dialogue_beat", beat1)
    # Also send standard dialogue event for legacy compatibility
    send_sse_event(conn, "dialogue", beat1)
    Process.sleep(500)

    # Beat 2: Lyra chimes in with arcane wit
    beat2 = %{
      step: 2,
      totalSteps: if(location == "inn", do: 4, else: 3),
      companionId: "lyra",
      speaker: "Lyra Shadowsong",
      portrait: "🔮",
      emote: "emote-spell",
      body: "*Lyra swirls an amber concoction in an earthen cup, an amused smirk playing on her lips.* \"Discipline this, honor that. If I had relied on rigid drills today, that ogre's club would have flattened our flank. Adaptability and forbidden power win wars, Valerius. What say you, #{hero_name}? Are you wedded to old oaths, or will you seize whatever edge keeps us alive?\""
    }
    send_sse_event(conn, "dialogue_beat", beat2)
    Process.sleep(500)

    # Beat 3: Bram joins with ranger pragmatism
    beat3 = %{
      step: 3,
      totalSteps: if(location == "inn", do: 4, else: 3),
      companionId: "bram",
      speaker: "Bram Ironfoot",
      portrait: "🏹",
      emote: "emote-rest",
      body: "*Bram chuckles, tossing a dry pinecone into the coals and passing around freshly carved skewers of venison.* \"Listen to you two scholars. Swords or spells, the wind cares little. What matters is watching each other's backs when the wolves howl. We fight for the folks sitting by this fire, plain and simple.\""
    }
    send_sse_event(conn, "dialogue_beat", beat3)
    Process.sleep(500)

    # Optional Beat 4: Innkeeper Garrick if resting at an inn
    if location == "inn" do
      beat4 = %{
        step: 4,
        totalSteps: 4,
        companionId: "garrick",
        speaker: "Garrick the Innkeeper",
        portrait: "🍺",
        emote: "emote-cheer",
        body: "*Garrick thumps three frothing tankards of spiced dwarven stout onto your timber table.* \"Arguments like that usually start tavern brawls, friends! Drink deep—the hearth is paid for, and tonight the road belongs to the ghosts, not to you.\""
      }
      send_sse_event(conn, "dialogue_beat", beat4)
      Process.sleep(400)
    end

    # 4. Interactive Branching Choices with Multi-Companion Affinity Deltas
    choice_prompt = %{
      prompt: "The party looks to you around the fire. How do you lead them?",
      choices: [
        %{
          id: "choice_comrade",
          label: "\"Bram speaks true. We fight for one another. No oath or ambition matters more than our survival together.\"",
          companionId: "bram",
          affinityDelta: 6,
          tone: "Brotherhood & Camaraderie",
          affinities: %{"valerius" => 5, "lyra" => 4, "bram" => 8}
        },
        %{
          id: "choice_stoic",
          label: "\"Valerius is right. Without discipline and unwavering code, we are just brigands with sharp steel.\"",
          companionId: "valerius",
          affinityDelta: 8,
          tone: "Chivalric & Disciplined",
          affinities: %{"valerius" => 8, "bram" => 4, "lyra" => -3}
        },
        %{
          id: "choice_ambition",
          label: "\"Lyra sees clearly. Power, cunning, and seizing the advantage are how kingdoms are forged.\"",
          companionId: "lyra",
          affinityDelta: 8,
          tone: "Ambitious & Arcane Edge",
          affinities: %{"lyra" => 8, "bram" => 2, "valerius" => -4}
        },
        %{
          id: "choice_toast",
          label: "\"Raise your flagons. Tonight we rest. Tomorrow we take whatever fortune throws at us!\"",
          companionId: "valerius",
          affinityDelta: 4,
          tone: "High Spirits & Unity",
          affinities: %{"valerius" => 5, "lyra" => 5, "bram" => 6}
        }
      ]
    }
    send_sse_event(conn, "choice_prompt", choice_prompt)

    # Await player response
    Process.sleep(300)
    send_sse_event(conn, "ready", %{status: "awaiting_player_choice"})

    conn
  end

  defp send_sse_event(conn, event_name, data) do
    payload = "event: #{event_name}\ndata: #{Jason.encode!(data)}\n\n"
    case chunk(conn, payload) do
      {:ok, conn} -> conn
      {:error, _} -> conn
    end
  end

  # ── HANDLE DIALOGUE CHOICE ────────────────────────────────────────

  def handle_choice(conn, params) do
    user_id = conn.assigns[:user_id]
    char_id = to_int(params["charId"] || params["char_id"])
    choice_id = params["choiceId"] || ""
    primary_companion = params["companionId"] || "valerius"
    primary_delta = to_int(params["affinityDelta"] || params["delta"] || 4)

    # Multi-companion affinity map (fallback to single companion if absent)
    incoming_affinities =
      case params["affinities"] do
        map when is_map(map) -> map
        _ -> %{primary_companion => primary_delta}
      end

    # Persist affinities in character state_json
    case Repo.query("SELECT state_json FROM characters WHERE id=? AND user_id=?", [char_id, user_id]) do
      {:ok, %{rows: [[raw_state]]}} ->
        state = parse_json(raw_state)
        current_affinities = Map.get(state, "companion_affinities", %{})

        # Apply deltas for all companions in the map
        updated_affinities =
          Enum.reduce(incoming_affinities, current_affinities, fn {comp_id, d}, acc ->
            val = Map.get(acc, comp_id, 50)
            new_val = min(100, max(0, val + to_int(d)))
            Map.put(acc, comp_id, new_val)
          end)

        # Also give companion-to-companion bonds a boost on unifying choices!
        bonds = Map.get(state, "companion_bonds", %{})
        bond_boost = if choice_id in ["choice_comrade", "choice_toast"], do: 5, else: 2

        updated_bonds =
          Enum.reduce(["valerius_lyra", "valerius_bram", "lyra_bram"], bonds, fn pair, acc ->
            pair_data = Map.get(acc, pair, %{"points" => 50, "rank" => "B"})
            current_pts = Map.get(pair_data, "points", 50)
            new_pts = min(100, current_pts + bond_boost)
            Map.put(acc, pair, Map.put(pair_data, "points", new_pts))
          end)

        updated_state =
          state
          |> Map.put("companion_affinities", updated_affinities)
          |> Map.put("companion_bonds", updated_bonds)

        Repo.query!("UPDATE characters SET state_json=? WHERE id=?", [Jason.encode!(updated_state), char_id])

        # Generate individual reactions for companions
        reactions = build_companion_reactions(choice_id, incoming_affinities)

        # Legacy top-level response compatibility
        primary_new_affinity = Map.get(updated_affinities, primary_companion, 55)
        primary_reaction = Enum.find(reactions, &(&1.companionId == primary_companion)) || List.first(reactions)

        json(conn, %{
          success: true,
          companionId: primary_companion,
          affinityDelta: primary_delta,
          newAffinity: primary_new_affinity,
          reply: primary_reaction.reply,
          reactions: reactions,
          updatedAffinities: updated_affinities,
          message: build_approval_summary(incoming_affinities)
        })

      _ ->
        json(conn, %{success: false, message: "Character not found."})
    end
  end

  defp build_companion_reactions(choice_id, affinities) do
    case choice_id do
      "choice_comrade" ->
        [
          %{
            companionId: "bram",
            speaker: "Bram Ironfoot",
            portrait: "🏹",
            delta: Map.get(affinities, "bram", 8),
            reply: "\"Now that is a commander worth bleeding for! Pass your cup, Captain. To the road!\" *He beams broadly.*"
          },
          %{
            companionId: "valerius",
            speaker: "Valerius",
            portrait: "⚔️",
            delta: Map.get(affinities, "valerius", 5),
            reply: "\"A bond forged in steel and shared hardship cannot be broken by shadow. You have my shield.\" *He nods solemnly.*"
          },
          %{
            companionId: "lyra",
            speaker: "Lyra Shadowsong",
            portrait: "🔮",
            delta: Map.get(affinities, "lyra", 4),
            reply: "\"Sentimental... yet I must admit, it is refreshing not having to check behind my back for daggers.\" *She smiles quietly.*"
          }
        ]

      "choice_stoic" ->
        [
          %{
            companionId: "valerius",
            speaker: "Valerius",
            portrait: "⚔️",
            delta: Map.get(affinities, "valerius", 8),
            reply: "\"Spoken with the clarity of a true knight. A company governed by discipline can breach any fortress.\" *He salutes.*"
          },
          %{
            companionId: "bram",
            speaker: "Bram Ironfoot",
            portrait: "🏹",
            delta: Map.get(affinities, "bram", 4),
            reply: "\"Can't argue with results. A sharp blade and an alert sentry have kept me breathing fifty winters.\" *He grins.*"
          },
          %{
            companionId: "lyra",
            speaker: "Lyra Shadowsong",
            portrait: "🔮",
            delta: Map.get(affinities, "lyra", -3),
            reply: "\"Just take care that your rigid honor doesn't blind you when the ground opens beneath our boots.\" *She rolls her eyes softly.*"
          }
        ]

      "choice_ambition" ->
        [
          %{
            companionId: "lyra",
            speaker: "Lyra Shadowsong",
            portrait: "🔮",
            delta: Map.get(affinities, "lyra", 8),
            reply: "\"At last, someone who understands reality. The weak write songs of martyrdom; the clever survive and rule.\" *Her eyes gleam with arcane spark.*"
          },
          %{
            companionId: "valerius",
            speaker: "Valerius",
            portrait: "⚔️",
            delta: Map.get(affinities, "valerius", -4),
            reply: "\"Ambition without virtue is how tyrants are born, #{to_string(primary_companion_name(affinities))}. Pray we do not lose our way.\" *His brow furrows.*"
          },
          %{
            companionId: "bram",
            speaker: "Bram Ironfoot",
            portrait: "🏹",
            delta: Map.get(affinities, "bram", 2),
            reply: "\"Gold buys good boots and dry wool, so I won't complain. Just remember who cooks the rations.\" *He winks.*"
          }
        ]

      _ ->
        [
          %{
            companionId: "bram",
            speaker: "Bram Ironfoot",
            portrait: "🏹",
            delta: 6,
            reply: "\"To tomorrow! May our arrows fly straight and our ale never run dry!\" *He clinks his flagon.*"
          },
          %{
            companionId: "valerius",
            speaker: "Valerius",
            portrait: "⚔️",
            delta: 5,
            reply: "\"Fair enough. Rest well, company. At first light, we march.\" *He stokes the embers.*"
          },
          %{
            companionId: "lyra",
            speaker: "Lyra Shadowsong",
            portrait: "🔮",
            delta: 5,
            reply: "\"A peaceful night is a rare gift. I will maintain the warding runes.\" *She sips her tea.*"
          }
        ]
    end
  end

  defp build_approval_summary(affinities) do
    Enum.map(affinities, fn {comp_id, d} ->
      delta = to_int(d)
      name = String.capitalize(to_string(comp_id))
      cond do
        delta > 0 -> "#{name} approves (+#{delta})"
        delta < 0 -> "#{name} disapproves (#{delta})"
        true -> "#{name} observes"
      end
    end)
    |> Enum.join(", ")
  end

  defp primary_companion_name(_), do: "Leader"

  # ── FIRE EMBLEM COMPANION SUPPORTS ────────────────────────────────

  def support_status(conn, %{"char_id" => char_id_param}) do
    user_id = conn.assigns[:user_id]
    char_id = to_int(char_id_param)

    case Repo.query("SELECT state_json FROM characters WHERE id=? AND user_id=?", [char_id, user_id]) do
      {:ok, %{rows: [[raw_state]]}} ->
        state = parse_json(raw_state)
        saved_bonds = Map.get(state, "companion_bonds", %{})

        pairs = [
          build_support_pair("valerius_lyra", "Valerius", "Lyra Shadowsong", "⚔️", "🔮", "Rivals to Mutual Respect", 40, "C", "B", 60, saved_bonds),
          build_support_pair("valerius_bram", "Valerius", "Bram Ironfoot", "⚔️", "🏹", "Brothers-in-Arms", 75, "B", "A", 80, saved_bonds),
          build_support_pair("lyra_bram", "Lyra Shadowsong", "Bram Ironfoot", "🔮", "🏹", "Unlikely Friends", 65, "B", "A", 80, saved_bonds)
        ]

        json(conn, %{
          success: true,
          pairs: pairs
        })

      _ ->
        json(conn, %{success: false, message: "Character not found."})
    end
  end

  defp build_support_pair(pair_id, name_a, name_b, icon_a, icon_b, relationship, base_pts, default_rank, next_rank, target_pts, saved_bonds) do
    saved = Map.get(saved_bonds, pair_id, %{})
    points = Map.get(saved, "points", base_pts)
    rank = Map.get(saved, "rank", default_rank)
    unlocked_scenes = Map.get(saved, "unlocked_scenes", [default_rank])

    # Has the player reached required points and not yet completed the conversation?
    can_unlock = points >= target_pts and not (next_rank in unlocked_scenes)

    combat_synergy =
      case rank do
        "S" -> "Rank S: +25% Crit, +15 Atk, 50% Dual Strike, 35% Dual Guard"
        "A" -> "Rank A: +15% Crit, +10 Atk, 35% Dual Strike, 20% Dual Guard"
        "B" -> "Rank B: +10% Crit, +5 Def, 20% Dual Strike"
        _ -> "Rank C: +5% Hit & Evade"
      end

    next_synergy =
      case next_rank do
        "S" -> "Rank S: +25% Crit, +15 Atk, 50% Dual Strike & 35% Dual Guard"
        "A" -> "Rank A: +15% Crit, +10 Atk, 35% Dual Strike & 20% Dual Guard"
        "B" -> "Rank B: +10% Crit, +5 Def & unlocks Dual Strike (20%)"
        _ -> "Rank C: +5% Hit & Evade"
      end

    %{
      pairId: pair_id,
      nameA: name_a,
      nameB: name_b,
      iconA: icon_a,
      iconB: icon_b,
      relationship: relationship,
      rank: rank,
      nextRank: next_rank,
      points: points,
      targetPoints: target_pts,
      canUnlock: can_unlock,
      unlockedScenes: unlocked_scenes,
      combatSynergy: combat_synergy,
      nextSynergy: next_synergy
    }
  end

  def stream_support_conversation(conn, params) do
    pair_id = params["pair"] || "valerius_lyra"
    rank = params["rank"] || "B"

    conn =
      conn
      |> put_resp_header("content-type", "text/event-stream")
      |> put_resp_header("cache-control", "no-cache")
      |> put_resp_header("connection", "keep-alive")
      |> put_resp_header("x-accel-buffering", "no")
      |> send_chunked(200)

    # 1. Stage Info
    stage = %{
      title: "Support Conversation: #{format_pair_title(pair_id)}",
      subtitle: "Support Rank #{rank}",
      pairId: pair_id,
      location: "campfire"
    }
    send_sse_event(conn, "support_stage", stage)
    Process.sleep(300)

    # 2. Scene Narrative chunks
    narratives = get_support_narrative(pair_id, rank)
    for chunk <- narratives do
      send_sse_event(conn, "support_narrative", %{text: chunk})
      Process.sleep(80)
    end
    send_sse_event(conn, "support_narrative_end", %{fullText: Enum.join(narratives, "")})
    Process.sleep(400)

    # 3. Alternating Dialogue Beats with Sovereign Soul Voices
    beats = get_support_dialogue(pair_id, rank)
    for beat <- beats do
      send_sse_event(conn, "support_beat", beat)
      Process.sleep(600)
    end

    # 4. Ready event with promotion payload
    send_sse_event(conn, "support_ready", %{
      pairId: pair_id,
      rank: rank,
      status: "ready_to_complete",
      bonusPoints: 15
    })

    conn
  end

  def complete_support_conversation(conn, params) do
    user_id = conn.assigns[:user_id]
    char_id = to_int(params["charId"] || params["char_id"])
    pair_id = params["pair"] || params["pairId"] || "valerius_lyra"
    promoted_rank = params["rank"] || "B"

    case Repo.query("SELECT state_json FROM characters WHERE id=? AND user_id=?", [char_id, user_id]) do
      {:ok, %{rows: [[raw_state]]}} ->
        state = parse_json(raw_state)
        bonds = Map.get(state, "companion_bonds", %{})
        pair_data = Map.get(bonds, pair_id, %{})

        current_pts = Map.get(pair_data, "points", 60)
        unlocked = Map.get(pair_data, "unlocked_scenes", ["C"]) |> Enum.concat([promoted_rank]) |> Enum.uniq()

        updated_pair =
          pair_data
          |> Map.put("rank", promoted_rank)
          |> Map.put("points", min(100, current_pts + 15))
          |> Map.put("unlocked_scenes", unlocked)

        updated_bonds = Map.put(bonds, pair_id, updated_pair)
        updated_state = Map.put(state, "companion_bonds", updated_bonds)

        Repo.query!("UPDATE characters SET state_json=? WHERE id=?", [Jason.encode!(updated_state), char_id])

        synergy_desc =
          case promoted_rank do
            "S" -> "Rank S Unlocked! 50% Dual Strike & 35% Dual Guard active in battle!"
            "A" -> "Rank A Unlocked! 35% Dual Strike & 20% Dual Guard active in battle!"
            "B" -> "Rank B Unlocked! 20% Dual Strike follow-up attacks now active in battle!"
            _ -> "Rank C Unlocked! +5% Hit & Evade passive bonus active!"
          end

        json(conn, %{
          success: true,
          pairId: pair_id,
          rank: promoted_rank,
          points: updated_pair["points"],
          message: "Support bond strengthened! #{synergy_desc}",
          combatSynergy: synergy_desc
        })

      _ ->
        json(conn, %{success: false, message: "Character not found."})
    end
  end

  # ── EMERGENT COMPANION CRISIS & PERSONAL QUEST DIRECTOR ───────────

  @crisis_definitions [
    %{
      id: "bram_guildmaster",
      companion_id: "bram",
      companion_name: "Bram Ironfoot",
      companion_icon: "🏹",
      title: "Blood on the Pine",
      subtitle: "A Deserter's Trail in the Mist",
      summary: "Bram discovers the blood-marked trail of Commander Harek, his former guildmaster who betrayed forty young scouts to the Syndicate.",
      stakes: "Revenge vs. Redemption",
      location: "deep_forest_camp",
      duo_art_reward: "vanguard_crossfire",
      choices: [
        %{id: "choice_execute", label: "Execute the Deserter", description: "Let Bram take his bloody revenge (+25 Atk, merciless resolve).", icon: "🗡️"},
        %{id: "choice_redeem", label: "Break The Cycle (S-Rank Bond)", description: "Spare him for trial & forge an unbreakable oath. Unlocks S-Rank Duo Art: Vanguard Crossfire!", icon: "🛡️"}
      ]
    },
    %{
      id: "lyra_void_rift",
      companion_id: "lyra",
      companion_name: "Lyra Shadowsong",
      companion_icon: "🔮",
      title: "The Shattered Leyline",
      subtitle: "Whispers of the Astral Abyss",
      summary: "An astral tear splits open above the campsite, offering Lyra raw forbidden void magic in exchange for her humanity.",
      stakes: "Void Ascendancy vs. Human Tether",
      location: "astral_fissure",
      duo_art_reward: "radiant_eclipse",
      choices: [
        %{id: "choice_consume", label: "Harness the Void Spark", description: "Feed her thirst for dark power (+30 Magic, dark veil).", icon: "🌑"},
        %{id: "choice_purify", label: "Weave Together (S-Rank Bond)", description: "Channel souls in unison to seal the rift. Unlocks S-Rank Duo Art: Radiant Eclipse!", icon: "✨"}
      ]
    },
    %{
      id: "valerius_inquisitor",
      companion_id: "valerius",
      companion_name: "Valerius",
      companion_icon: "⚔️",
      title: "The Inquisitor's Decree",
      subtitle: "An Ultimatum of Steel and Ash",
      summary: "A death warrant from the High Inquisitor commands Valerius to execute his companions as heretics or be branded an outcast.",
      stakes: "Holy Dogma vs. The Living Oath",
      location: "iron_chapel",
      duo_art_reward: "aegis_of_the_unbroken",
      choices: [
        %{id: "choice_orthodoxy", label: "Honor the Iron Creed", description: "Cling to ancient dogma (+35 Defense, austere armor).", icon: "📜"},
        %{id: "choice_covenant", label: "Sever The Chains (S-Rank Bond)", description: "Burn the decree and swear fealty to the party. Unlocks S-Rank Duo Art: Aegis of the Unbroken!", icon: "🛡️"}
      ]
    }
  ]

  @duo_art_defs %{
    "vanguard_crossfire" => %{
      id: "vanguard_crossfire",
      name: "Vanguard Crossfire",
      companion: "bram",
      icon: "🏹⚡",
      damage: 135,
      element: "frost_piercing",
      description: "Bram pins the target with a frost arrow while you shatter their defenses with a heavy cleave."
    },
    "radiant_eclipse" => %{
      id: "radiant_eclipse",
      name: "Radiant Eclipse",
      companion: "lyra",
      icon: "🔮☀️",
      damage: 150,
      element: "astral_fire",
      description: "Lyra channels a blinding cosmic vortex, pulling enemies together for your cataclysmic strike."
    },
    "aegis_of_the_unbroken" => %{
      id: "aegis_of_the_unbroken",
      name: "Aegis of the Unbroken",
      companion: "valerius",
      icon: "🛡️✨",
      damage: 110,
      element: "holy_retribution",
      description: "Valerius grants total party invulnerability for 1 turn, retaliating with a consecrated shockwave."
    }
  }

  def crisis_status(conn, %{"char_id" => char_id_param}) do
    user_id = conn.assigns[:user_id]
    char_id = to_int(char_id_param)

    state_data =
      case Repo.query("SELECT state_json FROM characters WHERE id=? AND user_id=?", [char_id, user_id]) do
        {:ok, %{rows: [[raw_state]]}} -> parse_json(raw_state)
        _ -> %{}
      end

    crises_resolved = Map.get(state_data, "companion_crises", %{})
    duo_arts = Map.get(state_data, "duo_combat_arts", [])

    crises =
      Enum.map(@crisis_definitions, fn defn ->
        resolved_info = Map.get(crises_resolved, defn.id)
        status = if resolved_info, do: "resolved", else: "available"
        Map.merge(defn, %{status: status, resolution: resolved_info})
      end)

    json(conn, %{
      success: true,
      crises: crises,
      unlockedDuoArts: duo_arts
    })
  end

  def stream_crisis_conversation(conn, params) do
    crisis_id = params["crisisId"] || params["crisis_id"] || "bram_guildmaster"
    crisis_def = Enum.find(@crisis_definitions, &(&1.id == crisis_id)) || List.first(@crisis_definitions)

    conn =
      conn
      |> put_resp_header("content-type", "text/event-stream")
      |> put_resp_header("cache-control", "no-cache")
      |> put_resp_header("connection", "keep-alive")
      |> put_resp_header("x-accel-buffering", "no")
      |> send_chunked(200)

    # 1. Stage Info
    stage = %{
      crisisId: crisis_def.id,
      title: crisis_def.title,
      subtitle: crisis_def.subtitle,
      companion: crisis_def.companion_name,
      companionIcon: crisis_def.companion_icon,
      location: crisis_def.location,
      stakes: crisis_def.stakes
    }
    send_sse_event(conn, "crisis_stage", stage)
    Process.sleep(250)

    # 2. Scene Narrative chunks
    narratives = get_crisis_narrative(crisis_def.id)
    for chunk <- narratives do
      send_sse_event(conn, "crisis_narrative", %{text: chunk})
      Process.sleep(70)
    end
    send_sse_event(conn, "crisis_narrative_end", %{fullText: Enum.join(narratives, "")})
    Process.sleep(300)

    # 3. Cinematic Dialogue Beats
    beats = get_crisis_dialogue(crisis_def.id)
    for beat <- beats do
      send_sse_event(conn, "crisis_beat", beat)
      Process.sleep(500)
    end

    # 4. Crisis Prompt with moral crossroads choices
    send_sse_event(conn, "crisis_prompt", %{
      crisisId: crisis_def.id,
      prompt: "The destiny of #{crisis_def.companion_name} rests in your hands. How do you counsel them?",
      choices: crisis_def.choices
    })

    conn
  end

  def resolve_crisis(conn, params) do
    user_id = conn.assigns[:user_id]
    char_id = to_int(params["charId"] || params["char_id"])
    crisis_id = params["crisisId"] || params["crisis_id"] || "bram_guildmaster"
    choice_id = params["choiceId"] || params["choice_id"] || "choice_redeem"

    crisis_def = Enum.find(@crisis_definitions, &(&1.id == crisis_id)) || List.first(@crisis_definitions)
    chosen_option = Enum.find(crisis_def.choices, &(&1.id == choice_id)) || List.first(crisis_def.choices)

    state_data =
      case Repo.query("SELECT state_json FROM characters WHERE id=? AND user_id=?", [char_id, user_id]) do
        {:ok, %{rows: [[raw_state]]}} -> parse_json(raw_state)
        _ -> %{}
      end

    crises = Map.get(state_data, "companion_crises", %{})
    duo_arts = Map.get(state_data, "duo_combat_arts", [])
    affinities = Map.get(state_data, "companion_affinities", %{})

    # Check if this choice awards the S-Rank Duo Art
    awarded_art =
      if choice_id in ["choice_redeem", "choice_purify", "choice_covenant"] do
        Map.get(@duo_art_defs, crisis_def.duo_art_reward)
      else
        nil
      end

    updated_duo_arts =
      if awarded_art && not Enum.any?(duo_arts, &(&1["id"] == awarded_art.id or &1[:id] == awarded_art.id)) do
        [awarded_art | duo_arts]
      else
        duo_arts
      end

    comp_id = crisis_def.companion_id
    updated_aff = Map.put(affinities, comp_id, min(100, Map.get(affinities, comp_id, 60) + 30))

    crisis_record = %{
      "crisis_id" => crisis_id,
      "choice_id" => choice_id,
      "choice_label" => chosen_option.label,
      "resolved_at" => DateTime.utc_now() |> DateTime.to_iso8601(),
      "duo_art_awarded" => (awarded_art && awarded_art.name) || nil
    }

    updated_crises = Map.put(crises, crisis_id, crisis_record)

    new_state_data =
      state_data
      |> Map.put("companion_crises", updated_crises)
      |> Map.put("duo_combat_arts", updated_duo_arts)
      |> Map.put("companion_affinities", updated_aff)

    # Award +250 XP
    Repo.query!(
      "UPDATE characters SET state_json = ?, experience = experience + 250 WHERE id = ?",
      [Jason.encode!(new_state_data), char_id]
    )

    reward_msg =
      if awarded_art do
        "⭐ S-Rank Duo Combat Art Unlocked: #{awarded_art.name}! #{awarded_art.description} (+30 Bond with #{crisis_def.companion_name}, +250 XP)"
      else
        "✅ Crisis Resolved: #{chosen_option.label}. #{chosen_option.description} (+30 Bond, +250 XP)"
      end

    json(conn, %{
      success: true,
      crisisId: crisis_id,
      choice: chosen_option,
      awardedDuoArt: awarded_art,
      newAffinity: Map.get(updated_aff, comp_id),
      message: reward_msg
    })
  end

  defp get_crisis_narrative("bram_guildmaster") do
    [
      "The mountain fog rolls thick across the ridge, shrouding pine trees in ghostly grey.",
      " Bram kneels in the damp needles, his weathered fingertips tracing a freshly notched trail sign—three cross-slashes stained with oxblood.",
      " 'Only one man cuts an archer's blaze like that,' Bram mutters, his jaw tightening until bone protrudes.",
      " 'Commander Harek. The bastard who sold our guild to the Syndicate.'"
    ]
  end

  defp get_crisis_narrative("lyra_void_rift") do
    [
      "Violet sparks dance across the tips of the pine needles. The campfire burns with a silent, eerie purple flame.",
      " Above the tree canopy, space itself warps like cracked glass—an ethereal tear weeping luminous void essence.",
      " Lyra stands bathed in the eerie light, her eyes glowing with raw arcane fervor,",
      " the shadows around her whispering forgotten syllables."
    ]
  end

  defp get_crisis_narrative("valerius_inquisitor") do
    [
      "A heavy wax-sealed parchment lies pierced to a tree stump by a silver dagger—the hallmark of the Iron Vanguard Grand Inquisitor.",
      " Valerius's knuckles are white against his pommel as he reads the condemnations scrawled in sanctified script.",
      " 'Heretics, outcasts, and rogues... they command me to execute our camp before sunrise or be branded an oath-breaker.'"
    ]
  end

  defp get_crisis_narrative(_), do: ["The camp falls dead quiet under a moonless sky..."]

  defp get_crisis_dialogue("bram_guildmaster") do
    [
      %{speaker: "Bram Ironfoot", icon: "🏹", text: "Ten years I tracked this shadow. Harek took gold from Blackbriar and led forty young bowmen straight into an iron trap. I was the only one who dug out of the mass grave.", emotion: "grim", cadence: "slow_raspy"},
      %{speaker: "Player", icon: "👑", text: "If we find him tonight, what does justice look like to you, Bram?", emotion: "questioning", cadence: "calm"},
      %{speaker: "Bram Ironfoot", icon: "🏹", text: "My hands tremble around my bowstring. Part of me wants to pin his tongue to an oak. But if I kill him in cold blood... am I any different than the butcher who left us to rot?", emotion: "conflicted", cadence: "heavy"}
    ]
  end

  defp get_crisis_dialogue("lyra_void_rift") do
    [
      %{speaker: "Lyra Shadowsong", icon: "🔮", text: "Listen to it... the Academy called it forbidden blasphemy. But it isn't chaos—it's pure, unfiltered creation! With just a fraction of this power, I could incinerate whole legions!", emotion: "intoxicated", cadence: "breathless"},
      %{speaker: "Player", icon: "👑", text: "Lyra, look at your hands. The rift is unraveling your soul. Anchor yourself to us.", emotion: "firm", cadence: "steady"},
      %{speaker: "Lyra Shadowsong", icon: "🔮", text: "If I seal it, the knowledge is lost forever. If I drink it in, I might lose myself. Stand with me... what path do we forge?", emotion: "vulnerable", cadence: "trembling"}
    ]
  end

  defp get_crisis_dialogue("valerius_inquisitor") do
    [
      %{speaker: "Valerius", icon: "⚔️", text: "For twenty winters, my oath to the Vanguard was my spine. My compass. Everything I believed about honor. And now they ask me to murder the only souls who stood shoulder-to-shoulder with me in the dark.", emotion: "anguished", cadence: "solemn"},
      %{speaker: "Player", icon: "👑", text: "An oath to tyrants isn't honor, Valerius. Honor is standing by those who bleed with you.", emotion: "resolute", cadence: "commanding"},
      %{speaker: "Valerius", icon: "⚔️", text: "Then let the High Inquisitor come! My blade answers to this party now! With you at my side, my shield will never falter!", emotion: "triumphant", cadence: "bold"}
    ]
  end

  defp get_crisis_dialogue(_) do
    [%{speaker: "Companion", icon: "⭐", text: "We must decide together.", emotion: "neutral", cadence: "normal"}]
  end

  defp format_pair_title("valerius_lyra"), do: "Valerius & Lyra"
  defp format_pair_title("valerius_bram"), do: "Valerius & Bram"
  defp format_pair_title("lyra_bram"), do: "Lyra & Bram"
  defp format_pair_title(other), do: String.replace(to_string(other), "_", " & ")

  defp get_support_narrative("valerius_lyra", _rank) do
    [
      "Late into the night, after the rest of the camp has drifted into exhausted sleep,",
      " Valerius sits near the flickering embers, rubbing holy oil along the fuller of his greatsword.",
      " Soft, muffled footsteps rustle the pine needles as Lyra approaches, carrying a small iron kettle."
    ]
  end

  defp get_support_narrative("valerius_bram", _rank) do
    [
      "At the perimeter of the campsite, Bram sits atop a fallen oak, peeling a willow twig with his skinning knife.",
      " Valerius walks the outer watch line, his heavy boots muffled by damp moss.",
      " The two veteran soldiers nod to one another in quiet understanding."
    ]
  end

  defp get_support_narrative("lyra_bram", _rank) do
    [
      "By the supply cart, Lyra carefully separates dried mountain herbs by candlelight.",
      " Bram crouches beside her, unrolling a leather bundle of fresh roots gathered along the creek bed."
    ]
  end

  defp get_support_dialogue("valerius_lyra", _rank) do
    [
      %{
        companionId: "valerius",
        speaker: "Valerius",
        portrait: "⚔️",
        emote: "emote-rest",
        body: "\"You fought well against the shade-weavers today, Lyra. But your final incantation... the temperature dropped twenty paces around you. That was void-weave. Such power always exacts a tithe.\""
      },
      %{
        companionId: "lyra",
        speaker: "Lyra Shadowsong",
        portrait: "🔮",
        emote: "emote-spell",
        body: "\"And your knightly catechism would have had us trampled beneath six hundred pounds of spectral fury, Paladin. Void or starlight, magic is a tool. It kept our hearts beating.\""
      },
      %{
        companionId: "valerius",
        speaker: "Valerius",
        portrait: "⚔️",
        emote: "emote-bow",
        body: "\"I do not question your resolve, Lyra. I question the cost. I have buried too many battle-brothers who thought they could tame the dark without becoming its feast. I would not bury you.\""
      },
      %{
        companionId: "lyra",
        speaker: "Lyra Shadowsong",
        portrait: "🔮",
        emote: "emote-rest",
        body: "*Lyra pauses, setting down her cup as the firelight softens her expression.* \"...You truly fear for my soul, don't you? Not just the mission. Hmph. Perhaps your breastplate hides more than rigid dogmas. I'll take care, Valerius. If only to spare you having to grieve.\""
      },
      %{
        companionId: "valerius",
        speaker: "Valerius",
        portrait: "⚔️",
        emote: "emote-rest",
        body: "*He gives a faint, respectful smile.* \"Then we have an accord. Guard your spirit, and my shield will remain between you and whatever horrors the frontier brings.\""
      }
    ]
  end

  defp get_support_dialogue("valerius_bram", _rank) do
    [
      %{
        companionId: "bram",
        speaker: "Bram Ironfoot",
        portrait: "🏹",
        emote: "emote-rest",
        body: "\"Third watch again, Sentinel? You walk like a man who hasn't slept properly since the Siege of Dunmere.\""
      },
      %{
        companionId: "valerius",
        speaker: "Valerius",
        portrait: "⚔️",
        emote: "emote-rest",
        body: "\"Old habits die hard, Bram. A sleeping captain is an invitation for a goblin raiding party. Besides, your bow never seems to leave your hands either.\""
      },
      %{
        companionId: "bram",
        speaker: "Bram Ironfoot",
        portrait: "🏹",
        emote: "emote-cheer",
        body: "\"That's because out here, stringing an arrow takes two seconds, but dying takes one. Still, having you on the line makes the night quieter. When you raise that tower shield, an archer can breathe.\""
      },
      %{
        companionId: "valerius",
        speaker: "Valerius",
        portrait: "⚔️",
        emote: "emote-bow",
        body: "\"And having an eye like yours in the treeline means no blade finds my back unawares. Drink your tea, brother. We hold the dawn together.\""
      }
    ]
  end

  defp get_support_dialogue("lyra_bram", _rank) do
    [
      %{
        companionId: "lyra",
        speaker: "Lyra Shadowsong",
        portrait: "🔮",
        emote: "emote-rest",
        body: "\"These wild bluecap mushrooms you gathered... dried and ground with silverleaf, they make a poultice that neutralizes wyvern venom within moments. Where did you learn this?\""
      },
      %{
        companionId: "bram",
        speaker: "Bram Ironfoot",
        portrait: "🏹",
        emote: "emote-cheer",
        body: "\"An old marsh witch taught my clan when the swamp fevers struck thirty summers back. She didn't use fancy arcane Latin like you, but she knew which moss stopped bleeding and which one made tea taste like honey.\""
      },
      %{
        companionId: "lyra",
        speaker: "Lyra Shadowsong",
        portrait: "🔮",
        emote: "emote-spell",
        body: "\"Folk alchemy often holds truths that grand academies dismiss in their arrogance. You have sharp eyes, Bram. Keep bringing me specimens, and I will ensure your quiver never runs out of enchanted frostheads.\""
      },
      %{
        companionId: "bram",
        speaker: "Bram Ironfoot",
        portrait: "🏹",
        emote: "emote-rest",
        body: "\"Deal struck, witch-lady. Frost arrows against desert raiders sounds like good sport to me.\""
      }
    ]
  end

  # ── PERFORM FULL REST (WITH AMBUSH CHANCE) ────────────────────────

  def perform_rest(conn, params) do
    user_id = conn.assigns[:user_id]
    char_id = to_int(params["charId"] || params["char_id"])
    rest_type = params["type"] || "wilderness"
    guard = params["guard"]
    force_ambush = params["force_ambush"] == true or params["force_ambush"] == "true"

    cost = if rest_type == "inn", do: 10, else: 0

    if cost > 0 do
      case Repo.query("SELECT currency FROM users WHERE id=?", [user_id]) do
        {:ok, %{rows: [[gold]]}} when gold >= cost ->
          Repo.query!("UPDATE users SET currency=currency-? WHERE id=?", [cost, user_id])
        _ ->
          nil
      end
    end

    should_ambush =
      if rest_type == "wilderness" do
        guard_reduction = case guard do
          "bram" -> 20
          "valerius" -> 15
          "lyra" -> 15
          _ -> 0
        end
        ambush_chance = max(5, 25 - guard_reduction)
        force_ambush or (:rand.uniform(100) <= ambush_chance)
      else
        false
      end

    if should_ambush do
      json(conn, %{
        success: true,
        ambush: true,
        restored: false,
        guard: guard,
        enemy: %{
          name: "Shadowstalker Prowlers",
          icon: "🐺",
          count: 3,
          level: 2,
          threat: "Night Predators"
        },
        tacticalOptions: [
          %{id: "hold_line", label: "Valerius Vanguard Wall", desc: "Block the initial lunge with iron shield wall", icon: "🛡️"},
          %{id: "flank_shot", label: "Bram Flanking Volley", desc: "Target the pack alpha from the shadows", icon: "🏹"},
          %{id: "starlight_flare", label: "Lyra Illumination Flare", desc: "Blind nocturnal predators with radiant magic", icon: "✨"}
        ],
        message: "AMBUSH! Snapping branches pierce the darkness! Glowing predatory eyes encircle the dying embers!"
      })
    else
      # Fully restore HP & MP to 100%
      Repo.query!(
        """
        UPDATE characters
        SET current_hp = max_hp,
            current_mp = max_mp
        WHERE id = ? AND user_id = ?
        """,
        [char_id, user_id]
      )

      json(conn, %{
        success: true,
        ambush: false,
        restored: true,
        restType: rest_type,
        message: if(rest_type == "inn", do: "Rested in a warm bed at the inn. HP and MP fully restored!", else: "Rest complete by the crackling campfire. HP and MP restored, mind cleared.")
      })
    end
  end

  # ── RESOLVE NIGHT AMBUSH DEFENSE ──────────────────────────────────

  def resolve_ambush(conn, params) do
    user_id = conn.assigns[:user_id]
    char_id = to_int(params["charId"] || params["char_id"])
    choice = params["tacticalChoice"] || "hold_line"
    guard = params["guard"] || "valerius"

    # Fully restore HP & MP and award +120 XP
    Repo.query!(
      """
      UPDATE characters
      SET current_hp = max_hp,
          current_mp = max_mp,
          experience = experience + 120
      WHERE id = ? AND user_id = ?
      """,
      [char_id, user_id]
    )

    {:ok, %{rows: [[state_json_raw]]}} =
      Repo.query("SELECT state_json FROM characters WHERE id = ?", [char_id])

    state_data = parse_json(state_json_raw)
    affinities = Map.get(state_data, "companion_affinities", %{})
    updated_aff =
      Map.merge(affinities, %{
        "valerius" => min(100, Map.get(affinities, "valerius", 65) + 10),
        "lyra" => min(100, Map.get(affinities, "lyra", 55) + 10),
        "bram" => min(100, Map.get(affinities, "bram", 60) + 10)
      })

    current_ingredients = Map.get(state_data, "cooking_ingredients", ["wild_venison", "mountain_herbs", "river_trout", "ironbark_mushroom", "spiced_ale"])
    looted = ["shadow_wolf_flank", "glowing_lichen"]
    updated_ingredients = Enum.uniq(current_ingredients ++ looted)

    new_state_data =
      state_data
      |> Map.put("companion_affinities", updated_aff)
      |> Map.put("cooking_ingredients", updated_ingredients)

    Repo.query!(
      "UPDATE characters SET state_json = ? WHERE id = ?",
      [Jason.encode!(new_state_data), char_id]
    )

    guard_reply = case choice do
      "flank_shot" -> "Bram: 'Heart-shot through the brush. The alpha's down, pack is scattering!'"
      "starlight_flare" -> "Lyra: 'The flare blinded them completely! Their night-vision is shattered!'"
      _ -> "Valerius: 'Shields held true! We stood as one, and the shadows broke against our steel!'"
    end

    json(conn, %{
      success: true,
      restored: true,
      ambushResolved: true,
      tacticalChoice: choice,
      guard: guard,
      guardReply: guard_reply,
      bonusXp: 120,
      lootedIngredients: looted,
      updatedAffinities: updated_aff,
      message: "Camp defense victorious! The party fought side-by-side in their camp clothes, repelling the midnight assault and forging deeper bonds (+10 Bond, +120 XP, rare nocturnal forage added to cooking pot)!"
    })
  end

  # ── CAMP ACTIVITIES & COOKING POT ─────────────────────────────────

  @default_recipes [
    %{
      id: "venison_stew",
      name: "Hunter's Hearty Venison Stew",
      icon: "🍲",
      ingredients: ["wild_venison", "mountain_herbs"],
      buff: %{
        name: "Hearty Vigor",
        icon: "💪",
        atk: 12,
        max_hp_pct: 15,
        description: "+12 Attack, +15% Max HP for next battles"
      },
      description: "Tender seared venison simmered with aromatic pine herbs and river salt."
    },
    %{
      id: "mushroom_roast",
      name: "Ironbark Mushroom Roast",
      icon: "🍄",
      ingredients: ["ironbark_mushroom", "mountain_herbs"],
      buff: %{
        name: "Iron Bark Ward",
        icon: "🛡️",
        def: 15,
        hit: 10,
        description: "+15 Defense, +10 Hit accuracy"
      },
      description: "Thick savory caps roasted over glowing coals until crisp and smoky."
    },
    %{
      id: "trout_broth",
      name: "River Trout & Spiced Broth",
      icon: "🐟",
      ingredients: ["river_trout", "spiced_ale"],
      buff: %{
        name: "Arcane Clarity",
        icon: "✨",
        crit: 15,
        max_mp_pct: 20,
        description: "+15% Crit Chance, +20% Max MP"
      },
      description: "Fresh river catch poached in foaming dark ale and crushed allspice."
    },
    %{
      id: "champions_feast",
      name: "Dragon-Spiced Campfire Feast",
      icon: "🍖",
      ingredients: ["shadow_wolf_flank", "glowing_lichen", "wild_venison"],
      buff: %{
        name: "Apex Predator",
        icon: "🔥",
        atk: 20,
        def: 20,
        crit: 20,
        description: "+20 Atk, +20 Def, +20% Crit (Ultimate Meal)"
      },
      description: "A legendary campfire banquet prepared from nocturnal spoils."
    }
  ]

  def cooking_status(conn, %{"char_id" => char_id_param}) do
    user_id = conn.assigns[:user_id]
    char_id = to_int(char_id_param)

    case Repo.query("SELECT state_json FROM characters WHERE id=? AND user_id=?", [char_id, user_id]) do
      {:ok, %{rows: [[state_raw]]}} ->
        state_data = parse_json(state_raw)
        ingredients = Map.get(state_data, "cooking_ingredients", ["wild_venison", "mountain_herbs", "river_trout", "ironbark_mushroom", "spiced_ale"])
        active_buff = Map.get(state_data, "meal_buff")

        sous_chefs = [
          %{id: "bram", name: "Bram Ironfoot", icon: "🏹", perk: "Expert field dresser (+15% Dish Potency)", quote: "Meat's fresh, hearth's hot. Let's make something that sticks to your ribs."},
          %{id: "lyra", name: "Lyra Shadowsong", icon: "🔮", perk: "Thermal evocation (+20% Duration)", quote: "Controlling the flame with miniature pyromancy ensures flawless braising."},
          %{id: "valerius", name: "Valerius", icon: "⚔️", perk: "Iron rations discipline (+15% Defense bonus)", quote: "Good food is the bedrock of martial fortitude. I shall tend the coals."}
        ]

        json(conn, %{
          success: true,
          ingredients: ingredients,
          recipes: @default_recipes,
          activeBuff: active_buff,
          sousChefs: sous_chefs
        })

      _ ->
        json(conn, %{success: false, message: "Character not found"})
    end
  end

  def cook_meal(conn, params) do
    user_id = conn.assigns[:user_id]
    char_id = to_int(params["charId"] || params["char_id"])
    recipe_id = params["recipeId"]
    sous_chef_id = params["sousChef"] || "bram"

    recipe = Enum.find(@default_recipes, fn r -> r.id == recipe_id end) || List.first(@default_recipes)

    {:ok, %{rows: [[state_raw]]}} =
      Repo.query("SELECT state_json FROM characters WHERE id=? AND user_id=?", [char_id, user_id])

    state_data = parse_json(state_raw)
    current_ingredients = Map.get(state_data, "cooking_ingredients", ["wild_venison", "mountain_herbs", "river_trout"])

    remaining_ingredients = current_ingredients -- recipe.ingredients
    remaining_ingredients = if remaining_ingredients == [], do: ["wild_venison", "mountain_herbs"], else: remaining_ingredients

    affinities = Map.get(state_data, "companion_affinities", %{})
    old_aff = Map.get(affinities, sous_chef_id, 50)
    new_aff = min(100, old_aff + 12)
    updated_aff = Map.put(affinities, sous_chef_id, new_aff)

    meal_buff = %{
      name: recipe.name,
      icon: recipe.icon,
      buff_name: recipe.buff.name,
      buff_icon: recipe.buff.icon,
      effects: recipe.buff,
      atk: recipe.buff[:atk] || 0,
      def: recipe.buff[:def] || 0,
      crit: recipe.buff[:crit] || 0,
      hit: recipe.buff[:hit] || 0,
      battles_left: 3,
      sous_chef: sous_chef_id
    }

    new_state_data =
      state_data
      |> Map.put("cooking_ingredients", remaining_ingredients)
      |> Map.put("companion_affinities", updated_aff)
      |> Map.put("meal_buff", meal_buff)

    Repo.query!("UPDATE characters SET state_json=? WHERE id=?", [Jason.encode!(new_state_data), char_id])

    chef_reply = case sous_chef_id do
      "lyra" -> "A precise pinch of crushed rosemary and heat controlled by embers... perfection! Even a sorceress must eat."
      "bram" -> "Now that's a meal fit for the high crags. Good meat, good herbs, no frills."
      _ -> "Hearty sustenance fuels our discipline. Let us partake and give thanks."
    end

    json(conn, %{
      success: true,
      dish: recipe.name,
      dishIcon: recipe.icon,
      mealBuff: meal_buff,
      chefReply: chef_reply,
      sousChef: sous_chef_id,
      affinityDelta: 12,
      newAffinity: new_aff,
      message: "#{recipe.name} cooked to perfection with #{String.capitalize(sous_chef_id)}! #{recipe.buff.description}"
    })
  end

  # ── SOUL-BOND COMPANION FUSION ───────────────────────────────────

  def companion_fusion(conn, params) do
    user_id = conn.assigns[:user_id]
    char_id = to_int(params["charId"] || params["char_id"])
    companion = params["companion"] || params["companion_ref"] || "valerius"
    duration = to_int(params["duration_minutes"] || 30, 30)

    case Repo.query("SELECT id FROM characters WHERE id = ? AND user_id = ?", [char_id, user_id]) do
      {:ok, %{rows: [[_]]}} ->
        case TePhoenix.Game.Fusion.fuse_with_companion(char_id, companion, duration_minutes: duration) do
          {:ok, fusion_summary} ->
            json(conn, %{success: true, fusion: fusion_summary, message: "Soul-Bond Fusion forged: #{fusion_summary["fused_name"]}!"})

          {:error, reason} ->
            json(conn, %{success: false, message: reason})
        end

      _ ->
        json(conn, %{success: false, message: "Character not found or unauthorized."})
    end
  end

  def companion_fusion_status(conn, params) do
    char_id = to_int(params["charId"] || params["char_id"])
    active_fusion = TePhoenix.Game.Fusion.active_companion_fusion(char_id)

    json(conn, %{
      success: true,
      active_fusion: active_fusion,
      is_fused: not is_nil(active_fusion)
    })
  end

  def defuse_companion(conn, params) do
    user_id = conn.assigns[:user_id]
    char_id = to_int(params["charId"] || params["char_id"])

    case Repo.query("SELECT id FROM characters WHERE id = ? AND user_id = ?", [char_id, user_id]) do
      {:ok, %{rows: [[_]]}} ->
        case TePhoenix.Game.Fusion.defuse_companion(char_id) do
          {:ok, msg} ->
            json(conn, %{success: true, message: msg})

          {:error, reason} ->
            json(conn, %{success: false, message: reason})
        end

      _ ->
        json(conn, %{success: false, message: "Character not found or unauthorized."})
    end
  end

  # ── HELPERS ───────────────────────────────────────────────────────

  defp resolve_biome_for_map(map_id) do
    region_info =
      case Repo.query("SELECT m.name, r.name, r.danger_level FROM game_maps m LEFT JOIN game_regions r ON m.region_id = r.id WHERE m.id = ?", [map_id]) do
        {:ok, %{rows: [[map_name, reg_name, danger]]}} ->
          %{map_name: map_name || "", region_name: reg_name || "", danger: danger || 1}
        _ ->
          %{map_name: "", region_name: "", danger: 1}
      end

    combined_text = String.downcase("#{region_info.map_name} #{region_info.region_name}")

    cond do
      String.contains?(combined_text, ["snow", "frost", "ice", "glacial", "winter", "peak", "alpine"]) ->
        %{
          key: "snow",
          name: if(region_info.region_name != "", do: region_info.region_name, else: "Frostfell Peaks"),
          icon: "❄️",
          particles: "snow",
          atmosphere: "Whistling freezing gales and icy pineneedles.",
          danger: region_info.danger,
          ambient: "wintry_wind"
        }

      String.contains?(combined_text, ["swamp", "mire", "bog", "marsh", "murk", "slough"]) ->
        %{
          key: "swamp",
          name: if(region_info.region_name != "", do: region_info.region_name, else: "Sunken Mire"),
          icon: "🍄",
          particles: "mist",
          atmosphere: "Heavy sulfur mist and damp moss over treacherous bogs.",
          danger: region_info.danger,
          ambient: "swamp_croaks"
        }

      String.contains?(combined_text, ["volcan", "ash", "cinder", "fire", "lava", "brimstone"]) ->
        %{
          key: "volcanic",
          name: if(region_info.region_name != "", do: region_info.region_name, else: "Cinder Crag"),
          icon: "🌋",
          particles: "embers",
          atmosphere: "Glowing fissures in black basalt, drifting orange ash.",
          danger: region_info.danger + 1,
          ambient: "volcanic_rumble"
        }

      String.contains?(combined_text, ["desert", "sand", "dune", "waste", "scorch"]) ->
        %{
          key: "desert",
          name: if(region_info.region_name != "", do: region_info.region_name, else: "Dune Sea"),
          icon: "🏜️",
          particles: "sand",
          atmosphere: "Dry desert winds carrying fine golden sand under starry skies.",
          danger: region_info.danger,
          ambient: "desert_wind"
        }

      String.contains?(combined_text, ["coast", "sea", "ocean", "tide", "shore", "beach", "cove"]) ->
        %{
          key: "coastal",
          name: if(region_info.region_name != "", do: region_info.region_name, else: "Siren's Cove"),
          icon: "🌊",
          particles: "mist",
          atmosphere: "Rhythmic breaking surf and cool brine-kissed sea breeze.",
          danger: region_info.danger,
          ambient: "ocean_waves"
        }

      true ->
        %{
          key: "forest",
          name: if(region_info.region_name != "", do: region_info.region_name, else: "Whispering Woods"),
          icon: "🌲",
          particles: "fireflies",
          atmosphere: "Towering ancient oaks shelter the crackling hearth fire.",
          danger: region_info.danger,
          ambient: "night_forest"
        }
    end
  end

  defp get_party_companions(hero, affinities, biome_key \\ "forest") do
    val_quote = case biome_key do
      "snow" -> "Cold iron bites deep in the frost. Stoke the flames higher, #{hero["name"]}."
      "swamp" -> "Keep watch on the perimeter mud. Things that don't breathe crawl in these bogs."
      "volcanic" -> "Basalt stones make a sturdy windbreak. We sleep with swords drawn tonight."
      "desert" -> "The stars are sharp in the clear desert air. An honorable night for rest."
      _ -> "The fire keeps the creeping shadows at bay. Rest your shield, #{hero["name"]}."
    end

    lyra_quote = case biome_key do
      "snow" -> "My fingers are almost too frozen to somaticize a spark... Bram, gather more pinecones!"
      "swamp" -> "The damp air clings like poison vapor. I've placed a ward against stinging insects."
      "volcanic" -> "The geothermal currents here are intoxicating... I can taste elemental fire on the breeze."
      "desert" -> "A night without rain means an unobstructed view of the astral leylines."
      _ -> "The embers hum with lingering evocation. A quiet night is a rare luxury."
    end

    bram_quote = case biome_key do
      "snow" -> "Snow muffles footfalls. Good for stalking elk, bad for hearing wargs."
      "swamp" -> "Murkwater mud will rust chainmail overnight. Oil your gear before you lie down."
      "volcanic" -> "Brimstone smoke stings the nostrils, but heat is heat when your boots are worn thin."
      "desert" -> "Sand gets into every hinge. Best sleep with a scarf over your mouth."
      _ -> "Wind's blowing from the east. Smoke won't carry toward the goblin ridge."
    end

    [
      %{
        id: "valerius",
        name: "Valerius",
        title: "The Iron Sentinel",
        icon: "⚔️",
        class: "Paladin",
        affinity: Map.get(affinities, "valerius", 65),
        campQuote: val_quote,
        attire: "Quilted Linen Arming Doublet"
      },
      %{
        id: "lyra",
        name: "Lyra Shadowsong",
        title: "Arcane Weaver",
        icon: "🔮",
        class: "Sorceress",
        affinity: Map.get(affinities, "lyra", 55),
        campQuote: lyra_quote,
        attire: "Silk Lounging Tunic & Leather Breeches"
      },
      %{
        id: "bram",
        name: "Bram Ironfoot",
        title: "Mountain Tracker",
        icon: "🏹",
        class: "Ranger",
        affinity: Map.get(affinities, "bram", 60),
        campQuote: bram_quote,
        attire: "Fur-Trimmed Wool Vest"
      }
    ]
  end

  defp parse_json(nil), do: %{}
  defp parse_json(""), do: %{}
  defp parse_json(str) when is_binary(str) do
    case Jason.decode(str) do
      {:ok, map} when is_map(map) -> map
      _ -> %{}
    end
  end
  defp parse_json(_), do: %{}

  defp to_int(val, default \\ 0)
  defp to_int(nil, default), do: default
  defp to_int(val, _default) when is_integer(val), do: val
  defp to_int(val, default) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> n
      :error -> default
    end
  end
  defp to_int(_, default), do: default
end
