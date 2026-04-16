defmodule TePhoenix.Game.Quest do
  use Ecto.Schema

  @primary_key {:quest_id, :string, []}
  schema "quest_definitions" do
    field :title, :string
    field :description, :string
    field :quest_type, :string, default: "side"
    field :category, :string
    field :required_level, :integer, default: 1
    field :is_repeatable, :boolean, default: false
    field :repeat_cooldown_hours, :integer, default: 0
    field :max_completions, :integer
    field :objectives_json, :map
    field :rewards_json, :map
    field :is_active, :boolean, default: true
    field :condition_json, :map
    field :region_id, :integer

    timestamps(inserted_at: :created_at, updated_at: :updated_at)
  end
end
