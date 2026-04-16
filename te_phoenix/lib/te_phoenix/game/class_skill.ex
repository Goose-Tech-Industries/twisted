defmodule TePhoenix.Game.ClassSkill do
  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}
  schema "game_class_skills" do
    field :learn_level, :integer, default: 1
    field :mp_cost, :integer
    field :alt_name, :string

    belongs_to :class, TePhoenix.Game.Class, foreign_key: :class_id
    belongs_to :skill, TePhoenix.Game.Skill, foreign_key: :skill_id
  end
end
