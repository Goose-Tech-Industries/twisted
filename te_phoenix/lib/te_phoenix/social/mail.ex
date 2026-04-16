defmodule TePhoenix.Social.Mail do
  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}
  schema "character_mail" do
    field :sender_char_id, :integer
    field :sender_name, :string
    field :recipient_char_id, :integer
    field :subject, :string, default: "No subject"
    field :body, :string
    field :gold_attachment, :integer, default: 0
    field :gold_collected, :boolean, default: false
    field :is_read, :boolean, default: false
    field :is_deleted, :boolean, default: false
    field :expires_at, :naive_datetime

    timestamps(inserted_at: :sent_at, updated_at: false)
  end
end
