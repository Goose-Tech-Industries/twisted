defmodule TePhoenix.Game.BattleCommand do
  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}
  schema "game_battle_commands" do
    field :name, :string
    field :icon, :string, default: "⚔️"
    field :description, :string
    field :action_type, :string, default: "attack"
    field :target_type, :string, default: "ENEMY"
    field :is_default, :boolean, default: false
    field :display_order, :integer, default: 0
    field :class_ids, :map
    field :effects, :map
  end
end
