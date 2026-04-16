defmodule TePhoenix.Game.Skill do
  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}
  schema "game_skills" do
    field :name, :string
    field :description, :string
    field :battle_text, :string
    field :type, :string, default: "magic"
    field :target_type, :string, default: "ENEMY"
    field :elements, :map
    field :heal_status, :map
    field :icon, :string, default: "✨"
    field :effects, :map
  end
end
