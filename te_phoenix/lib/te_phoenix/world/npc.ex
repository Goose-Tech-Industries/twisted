defmodule TePhoenix.World.Npc do
  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}
  schema "game_npcs" do
    field :name, :string
    field :persona, :string
    field :x, :integer, default: 5
    field :y, :integer, default: 5
    field :icon, :string, default: "👤"
    field :script_key, :string
    field :is_enemy, :boolean, default: false
    field :char_id, :integer
    field :quest_offers_json, :map
    field :move_type, :string, default: "WANDER"
    field :wander_radius, :integer, default: 3
    field :schedule_json, :map
    field :shop_id, :integer
    field :drop_table_json, :map
    field :steal_table_json, :map
    field :mood, :string
    field :is_dead, :boolean, default: false
    field :predecessor_name, :string
    field :death_cause, :string
    field :patrol_path_json, :map

    belongs_to :map, TePhoenix.World.Map, foreign_key: :map_id
  end
end
