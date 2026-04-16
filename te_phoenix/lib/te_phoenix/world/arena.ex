defmodule TePhoenix.World.Arena do
  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}
  schema "game_arenas" do
    field :name, :string
    field :description, :string
    field :map_id, :integer
    field :x_min, :integer, default: 0
    field :y_min, :integer, default: 0
    field :x_max, :integer, default: 19
    field :y_max, :integer, default: 19
    field :type, :string, default: "OPEN_PVP"
    field :min_level, :integer, default: 1
    field :max_level, :integer, default: 99
    field :entry_fee, :integer, default: 0
    field :reward_multiplier, :float, default: 1.0
    field :max_players, :integer, default: 0
    field :level_matching, :boolean, default: true
    field :enabled, :boolean, default: true
  end
end
