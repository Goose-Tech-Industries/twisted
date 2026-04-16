defmodule TePhoenix.Combat.Battle do
  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}
  schema "game_battles" do
    field :p1_char_id, :integer
    field :p2_char_id, :integer
    field :p1_user_id, :integer
    field :p2_user_id, :integer
    field :turn_char_id, :integer
    field :battle_mode, :string, default: "1v1"
    field :status, :string, default: "pending"
    field :winner_char_id, :integer
    field :battle_log, :map
    field :access_token, :string

    has_many :participants, TePhoenix.Combat.BattleParticipant, foreign_key: :battle_id

    timestamps(inserted_at: :created_at, updated_at: :updated_at)
  end
end

defmodule TePhoenix.Combat.BattleParticipant do
  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}
  schema "game_battle_participants" do
    field :team, :integer
    field :is_ai, :boolean, default: false

    belongs_to :battle, TePhoenix.Combat.Battle, foreign_key: :battle_id
    belongs_to :character, TePhoenix.Game.Character, foreign_key: :character_id

    timestamps(inserted_at: :joined_at, updated_at: false)
  end
end
