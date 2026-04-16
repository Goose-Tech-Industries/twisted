defmodule TePhoenix.World.Region do
  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}
  schema "game_regions" do
    field :name, :string
    field :description, :string
    field :icon, :string, default: "🗺️"
    field :danger_level, :integer, default: 1
    field :corruption_level, :integer, default: 0
    field :faction_control, :string
    field :weather_override, :string
    field :xp_mult, :decimal, default: 1.00
    field :gold_mult, :decimal, default: 1.00
    field :loot_mult, :decimal, default: 1.00
    field :spawn_rate_mult, :decimal, default: 1.00
    field :shop_price_mult, :decimal, default: 1.00
    field :pvp_enabled, :boolean, default: false
    field :is_sanctuary, :boolean, default: false
    field :movement_penalty, :boolean, default: false
    field :active_tags_json, :map
    field :auto_rules_json, :map
    field :is_active, :boolean, default: true

    timestamps(inserted_at: :created_at, updated_at: :updated_at)
  end
end
