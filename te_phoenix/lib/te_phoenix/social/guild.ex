defmodule TePhoenix.Social.Guild do
  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}
  schema "guilds" do
    field :name, :string
    field :tag, :string
    field :description, :string
    field :emblem, :string, default: "⚔️"
    field :leader_id, :integer
    field :level, :integer, default: 1
    field :xp, :integer, default: 0
    field :gold_bank, :integer, default: 0
    field :motd, :string
    field :is_active, :boolean, default: true

    has_many :members, TePhoenix.Social.GuildMember, foreign_key: :guild_id

    timestamps(inserted_at: :created_at, updated_at: false)
    field :disbanded_at, :naive_datetime
  end
end

defmodule TePhoenix.Social.GuildMember do
  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}
  schema "guild_members" do
    field :rank, :string, default: "MEMBER"
    field :is_active, :boolean, default: true
    field :contribution, :integer, default: 0

    belongs_to :guild, TePhoenix.Social.Guild, foreign_key: :guild_id
    belongs_to :character, TePhoenix.Game.Character, foreign_key: :character_id

    timestamps(inserted_at: :joined_at, updated_at: false)
    field :left_at, :naive_datetime
  end
end
