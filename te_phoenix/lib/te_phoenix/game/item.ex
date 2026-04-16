defmodule TePhoenix.Game.Item do
  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}
  schema "game_items" do
    field :name, :string
    field :description, :string
    field :type, :string, default: "MISC"
    field :icon, :string, default: "📦"
    field :slot, :string
    field :value, :integer, default: 0
    field :bonus_hp, :integer, default: 0
    field :bonus_mp, :integer, default: 0
    field :bonus_atk, :integer, default: 0
    field :bonus_def, :integer, default: 0
    field :bonus_mo, :integer, default: 0
    field :bonus_md, :integer, default: 0
    field :bonus_speed, :integer, default: 0
    field :bonus_luck, :integer, default: 0
    field :level_req, :integer, default: 1
    field :elements, :map
    field :set_status, :string
    field :stats_json, :map
    field :effects, :map
  end
end
