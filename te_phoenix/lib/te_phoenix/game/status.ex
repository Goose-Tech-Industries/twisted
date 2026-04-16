defmodule TePhoenix.Game.Status do
  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}
  schema "game_statuses" do
    field :name, :string
    field :description, :string
    field :icon, :string, default: "⚡"
    field :type, :string, default: "debuff"
    field :default_duration, :integer, default: 3
    field :permanent, :boolean, default: false
    field :effects, :map
    field :disabled_commands, :map
  end
end
