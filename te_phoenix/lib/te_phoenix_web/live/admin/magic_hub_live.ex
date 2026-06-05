defmodule TePhoenixWeb.Admin.MagicHubLive do
  @moduledoc "Magic & Lore — oghams, artifacts, elements, enchantments, rituals, relics."
  use TePhoenixWeb, :live_view

  @per_page 30
  @tab_config [
    # Phase 1.5d — Spells tab (new). Test Cast button gated to this tab.
    {"Spells",        "game_spells"},
    {"Oghams",        "game_oghams"},
    {"Families",      "game_ogham_families"},
    {"Awakenings",    "game_ogham_awakenings"},
    {"Shards",        "game_ogham_shards"},
    {"Shard Recipes", "game_shard_recipes"},
    {"Fusions",       "game_ogham_fusions"},
    {"Corruption",    "game_ogham_corruption_tiers"},
    {"Spell Tomes",   "game_spell_tomes"},
    {"Affinities",    "game_elemental_affinities"},
    {"Reactions",     "game_elemental_reactions"},
    {"Curses",        "game_item_curses"},
    {"Enchantments",  "game_enchantments"},
    {"Magic Schools", "game_magic_schools"},
    {"Rituals",       "game_rituals"},
    {"Resistances",   "game_magic_resistances"},
    {"Artifacts",     "legendary_artifacts"},
    {"Art. Powers",   "artifact_powers"},
    {"Relic Sets",    "game_relic_sets"},
  ]

  use TePhoenixWeb.Admin.HubCrud,
    per_page: @per_page,
    tab_config: @tab_config,
    hub_title: "Magic & Lore Hub",
    active_tab: :magic,
    ai_features: %{"game_oghams" => "ogham_design"}

  # Pre-warm the magic schema on first hub mount so the Spells tab
  # has tables to read against. Idempotent — Magic.ensure_schema/0
  # caches via persistent_term.
  @impl true
  def handle_params(params, uri, socket) do
    TePhoenix.Game.Magic.ensure_schema()
    super_handle_params(params, uri, socket)
  end

  # Fallback super-call wrapper: HubCrud doesn't define handle_params,
  # so Phoenix LiveView's default no-op handler runs.
  defp super_handle_params(_, _, socket), do: {:noreply, socket}
end
