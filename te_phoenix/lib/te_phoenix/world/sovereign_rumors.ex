defmodule TePhoenix.World.SovereignRumors do
  @moduledoc """
  Sovereign Rumor & Eavesdropping Engine (*Intleacht na nGuthanna*).

  Generates rich ambient NPC conversations, trade secrets, and quest leads
  that players can overhear when sitting or standing beneath open/cracked building windows.
  Overhearing rumors updates player journal knowledge, grants Diplomacy/Perception XP,
  and unlocks secret perks (discount passphrases, hidden cellar locations, dungeon key leads).
  """

  alias TePhoenix.Repo
  alias TePhoenix.World.BuildingManager
  require Logger

  @rumor_database %{
    "prancing_mare" => [
      %{
        id: "mare_cellar_vault",
        speaker_a: "Barnaby the Merchant",
        speaker_b: "Rowan the Tavern Bard",
        dialogue: "Lower your voice, Rowan! If the patrons hear of the Sunken Vault beneath the eastern ruins, half the town will rush to their deaths. The brass seal only yields to the Shaman's Totem.",
        secret_type: :dungeon_lead,
        perk: "Sunken Vault Lead added to Journal",
        reward_xp: 35
      },
      %{
        id: "mare_olaf_past",
        speaker_a: "Rowan the Tavern Bard",
        speaker_b: "Patron Eldred",
        dialogue: "Don't mock poor Olaf. Before he took to the bottle, he was the Vanguard Commander for the High Thane. If someone treats him to fine spiced ale, he still remembers the ancient Shield Wall discipline.",
        secret_type: :combat_lore,
        perk: "Olaf Shield Stance Knowledge unlocked",
        reward_xp: 30
      },
      %{
        id: "mare_guard_bribe",
        speaker_a: "Patron Eldred",
        speaker_b: "A hooded traveller",
        dialogue: "The night watchman at the north barricade has sticky fingers. Offer him twenty gold coins and whisper 'Midnight Tide', and he'll turn his back while you slip past.",
        secret_type: :passphrase,
        perk: "Guards Bribe Phrase: 'Midnight Tide'",
        reward_xp: 40
      }
    ],
    "barnaby_shop" => [
      %{
        id: "barnaby_invisibility_recipe",
        speaker_a: "Barnaby",
        speaker_b: "Apprentice Kip",
        dialogue: "Careful with the moonflower extract! One drop too many and the draught turns to acid. But mix it with shadow ash crushed at midnight, and you produce a brew that renders the drinker unseen to sentries.",
        secret_type: :alchemy_recipe,
        perk: "Recipe: Shadow Draught of Invisibility",
        reward_xp: 45
      },
      %{
        id: "barnaby_secret_stock",
        speaker_a: "Barnaby",
        speaker_b: "Apprentice Kip",
        dialogue: "The Guild Inspectors are arriving tomorrow. Move the enchanted runic lockpicks into the loose hollow beneath floorboard seven. Keep the shop ledger clean!",
        secret_type: :contraband_stash,
        perk: "Hidden Floorboard Stash Location discovered",
        reward_xp: 50
      }
    ],
    "dawn_hearth" => [
      %{
        id: "dawn_cleansing_font",
        speaker_a: "Mother Althea",
        speaker_b: "Sister Clara",
        dialogue: "The holy waters of the inner courtyard still hold the Dawn Father's touch. Any weary pilgrim who bathes their blades in it at sunrise is cleansed of all necrotic corruption.",
        secret_type: :blessing_lore,
        perk: "Dawn Font Cleansing Ritual unlocked",
        reward_xp: 35
      },
      %{
        id: "dawn_catacomb_relic",
        speaker_a: "Sister Clara",
        speaker_b: "Mother Althea",
        dialogue: "I heard weeping from the crypts beneath the altar last night... Could the relic of Saint Brigid still be entombed below, waiting for a righteous soul to reclaim it?",
        secret_type: :relic_lead,
        perk: "Saint Brigid Crypt Quest lead discovered",
        reward_xp: 40
      }
    ],
    "shadow_den" => [
      %{
        id: "shadow_tunnel_passage",
        speaker_a: "Silas the Shadow Fence",
        speaker_b: "Smuggler Vane",
        dialogue: "The tunnel between our cellar and the tavern's wine vault is still clear. If the town watch raids the Den, kick down the false barrel rack and escape through the Prancing Mare's pantry.",
        secret_type: :secret_passage,
        perk: "Tavern Secret Tunnel Map Marker unlocked",
        reward_xp: 55
      },
      %{
        id: "shadow_syndicate_code",
        speaker_a: "Smuggler Vane",
        speaker_b: "Silas the Shadow Fence",
        dialogue: "Tell the fence at the harbor that 'The wolf hunts in silent snow'. He'll unlock the black market armory and discount all poisons by twenty-five percent.",
        secret_type: :black_market_code,
        perk: "Black Market Passcode: 'The wolf hunts in silent snow'",
        reward_xp: 60
      }
    ]
  }

  @doc """
  Eavesdrops on conversations occurring inside a building through an adjacent window.
  """
  def eavesdrop_at_window(player, map_id, window_x, window_y) do
    window = BuildingManager.get_window_at(map_id, window_x, window_y)

    case window do
      nil ->
        %{success: false, dialogue: "There is no window here to listen through."}

      %{state: "shuttered"} ->
        %{
          success: false,
          state: "shuttered",
          dialogue: "The heavy wooden shutters are latched tight. Only muffled murmurs reach your ears, impossible to decipher."
        }

      win ->
        building_key = win.building_key
        rumors = Map.get(@rumor_database, building_key, [])

        if rumors == [] do
          %{
            success: true,
            building_name: win.building_name,
            state: win.state,
            dialogue: "You listen quietly through the #{win.state} window, but only hear the crackle of hearth embers and distant footsteps inside."
          }
        else
          # If window is closed, roll Perception (D20 + WIS vs DC 12)
          perception_passed =
            if win.state == "closed" do
              wis = player.wis || 10
              wis_mod = div(wis - 10, 2)
              d20 = :rand.uniform(20)
              d20 + wis_mod >= 12
            else
              true
            end

          if perception_passed do
            rumor = Enum.random(rumors)
            save_rumor_intel(player.id, rumor)

            %{
              success: true,
              eavesdropped: true,
              building_key: building_key,
              building_name: win.building_name,
              window_state: win.state,
              speaker_a: rumor.speaker_a,
              speaker_b: rumor.speaker_b,
              dialogue: rumor.dialogue,
              perk: rumor.perk,
              secret_type: rumor.secret_type,
              reward_xp: rumor.reward_xp
            }
          else
            %{
              success: false,
              eavesdropped: false,
              building_name: win.building_name,
              window_state: win.state,
              dialogue: "You strain your ears against the closed glass, but cannot make out the muffled voices through the pane. (Perception Check Failed)"
            }
          end
        end
    end
  end

  @doc """
  Returns all rumors cataloged for a specific building.
  """
  def get_rumors_for_building(building_key) do
    Map.get(@rumor_database, building_key, [])
  end

  # ── Private Helpers ───────────────────────────────────────────────

  defp save_rumor_intel(char_id, rumor) do
    try do
      # Record rumor knowledge into npc_memories for persistence
      Repo.query(
        """
        INSERT INTO npc_memories (
          npc_name, character_id, memory_type, event_name, emotional_valence, summary, importance
        ) VALUES (?, ?, 'eavesdropped_rumor', ?, 0.5, ?, 4)
        ON DUPLICATE KEY UPDATE summary = VALUES(summary), importance = VALUES(importance)
        """,
        [rumor.speaker_a, char_id, to_string(rumor.id), "#{rumor.perk}: #{rumor.dialogue}"]
      )
    rescue
      _ -> :ok
    end
  end
end
