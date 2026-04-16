defmodule TePhoenix.Social.Party do
  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}
  schema "character_parties" do
    field :leader_id, :integer
    field :name, :string
    field :max_size, :integer, default: 4
    field :is_active, :boolean, default: true

    has_many :members, TePhoenix.Social.PartyMember, foreign_key: :party_id

    timestamps(inserted_at: :created_at, updated_at: false)
    field :disbanded_at, :naive_datetime
  end
end

defmodule TePhoenix.Social.PartyMember do
  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}
  schema "character_party_members" do
    field :role, :string, default: "MEMBER"
    field :is_active, :boolean, default: true

    belongs_to :party, TePhoenix.Social.Party, foreign_key: :party_id
    belongs_to :character, TePhoenix.Game.Character, foreign_key: :character_id

    timestamps(inserted_at: :joined_at, updated_at: false)
    field :left_at, :naive_datetime
  end
end
