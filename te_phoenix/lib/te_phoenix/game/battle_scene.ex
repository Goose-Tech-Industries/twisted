defmodule TePhoenix.Game.BattleScene do
  @moduledoc """
  A reusable battle backdrop. For ruleset-level TRANSITION battles, encounters
  reference a battle scene; the renderer loads the scene's backdrop_map and
  composes combatants over it using the formation anchor points.

  See project_battle_modes.md for the INLINE / TRANSITION / HYBRID design.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :id, autogenerate: true}
  schema "game_battle_scenes" do
    field :name, :string
    field :description, :string
    field :backdrop_map_id, :integer
    field :formation_anchors_json, :string
    field :ambient_music_asset_id, :integer
    field :special_effect_config_json, :string

    timestamps(inserted_at: :created_at, updated_at: false)
  end

  def changeset(scene, attrs) do
    scene
    |> cast(attrs, [
      :name,
      :description,
      :backdrop_map_id,
      :formation_anchors_json,
      :ambient_music_asset_id,
      :special_effect_config_json
    ])
    |> validate_required([:name])
  end
end
