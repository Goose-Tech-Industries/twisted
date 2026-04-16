defmodule TePhoenix.Game.Element do
  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}
  schema "game_elements" do
    field :name, :string
    field :icon, :string, default: "🔥"
    field :color, :string, default: "#ff6600"
    field :strengths_json, :map
    field :weaknesses_json, :map
  end
end
