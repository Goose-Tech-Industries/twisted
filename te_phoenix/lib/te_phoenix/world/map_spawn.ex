defmodule TePhoenix.World.MapSpawn do
  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}
  schema "game_map_spawns" do
    field :npc_char_id, :integer
    field :x, :integer, default: 5
    field :y, :integer, default: 5
    field :respawn_seconds, :integer, default: 30
    field :enabled, :boolean, default: true
    field :world_flag_conditions, :map

    belongs_to :map, TePhoenix.World.Map, foreign_key: :map_id
  end
end
