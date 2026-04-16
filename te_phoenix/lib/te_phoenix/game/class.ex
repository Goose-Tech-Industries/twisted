defmodule TePhoenix.Game.Class do
  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}
  schema "game_classes" do
    field :name, :string
    field :description, :string
    field :icon, :string, default: "⚔️"
    field :base_hp, :integer, default: 100
    field :base_mp, :integer, default: 50
    field :base_atk, :integer, default: 10
    field :base_def, :integer, default: 5
    field :base_mo, :integer, default: 5
    field :base_md, :integer, default: 5
    field :base_speed, :integer, default: 10
    field :base_luck, :integer, default: 5
    field :battle_cmds, :map
    field :hidden, :boolean, default: false
    field :sort_order, :integer, default: 0

    has_many :class_skills, TePhoenix.Game.ClassSkill, foreign_key: :class_id
    has_many :limit_breaks, TePhoenix.Game.LimitBreak, foreign_key: :class_id
  end
end
