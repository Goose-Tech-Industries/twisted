defmodule TePhoenix.World.Map do
  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}
  schema "game_maps" do
    field :name, :string
    field :description, :string
    field :width, :integer, default: 20
    field :height, :integer, default: 20
    field :tiles_json, :string
    field :collisions_json, :string
    field :objects_json, :string
    field :anims_json, :string
    field :tileset_url, :string
    field :ambient_dark, :float, default: 0.0
    field :fast_travel_enabled, :boolean, default: true
    field :min_level, :integer, default: 1
    field :is_active, :boolean, default: true
    field :region_id, :integer

    has_many :npcs, TePhoenix.World.Npc, foreign_key: :map_id
    has_many :spawns, TePhoenix.World.MapSpawn, foreign_key: :map_id

    timestamps(inserted_at: :created_at, updated_at: false)
  end
end
