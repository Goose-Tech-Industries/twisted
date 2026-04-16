defmodule TePhoenix.Social.Friend do
  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}
  schema "character_friends" do
    field :requester_id, :integer
    field :recipient_id, :integer
    field :status, :string, default: "pending"

    timestamps(inserted_at: :created_at, updated_at: :updated_at)
  end
end
