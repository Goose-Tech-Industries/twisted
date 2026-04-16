defmodule TePhoenix.Game.LimitBreak do
  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}
  schema "game_limit_breaks" do
    field :name, :string
    field :description, :string
    field :break_level, :integer, default: 1
    field :char_level_req, :integer, default: 1
    field :target_type, :string, default: "ENEMY"
    field :icon, :string, default: "💥"
    field :effects, :map

    belongs_to :class, TePhoenix.Game.Class, foreign_key: :class_id
  end
end
