defmodule TePhoenix.Game.Race do
  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}
  schema "game_races" do
    field :name, :string
    field :description, :string
    field :icon, :string, default: "🧬"
    field :lore, :string
    field :bonus_hp, :integer, default: 0
    field :bonus_mp, :integer, default: 0
    field :bonus_atk, :integer, default: 0
    field :bonus_def, :integer, default: 0
    field :bonus_mo, :integer, default: 0
    field :bonus_md, :integer, default: 0
    field :bonus_speed, :integer, default: 0
    field :bonus_luck, :integer, default: 0
    field :passive_ability, :string
    field :passive_desc, :string
    field :hidden, :boolean, default: false
  end
end
