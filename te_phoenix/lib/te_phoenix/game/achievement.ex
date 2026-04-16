defmodule TePhoenix.Game.Achievement do
  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}
  schema "game_achievements" do
    field :key_name, :string
    field :title, :string
    field :description, :string
    field :icon, :string, default: "🏆"
    field :category, :string, default: "other"
    field :trigger_type, :string, default: "manual"
    field :trigger_value, :integer, default: 1
    field :reward_gold, :integer, default: 0
    field :reward_title, :string
    field :is_hidden, :boolean, default: false
    field :is_active, :boolean, default: true
    field :sort_order, :integer, default: 0

    timestamps(inserted_at: :created_at, updated_at: false)
  end
end

defmodule TePhoenix.Game.CharacterAchievement do
  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}
  schema "character_achievements" do
    belongs_to :character, TePhoenix.Game.Character, foreign_key: :character_id
    belongs_to :achievement, TePhoenix.Game.Achievement, foreign_key: :achievement_id

    timestamps(inserted_at: :earned_at, updated_at: false)
  end
end
