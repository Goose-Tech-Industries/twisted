defmodule TePhoenix.Game.CraftRecipe do
  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}
  schema "game_craft_recipes" do
    field :name, :string
    field :category, :string, default: "MISC"
    field :result_item_id, :integer
    field :result_qty, :integer, default: 1
    field :level_req, :integer, default: 1
    field :skill_req, :string
    field :ingredients_json, :map
    field :unlock_mode, :string, default: "ALWAYS"
    field :description, :string
    field :icon, :string, default: "🔨"
    field :is_active, :boolean, default: true
  end
end
