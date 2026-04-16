defmodule TePhoenix.Accounts.User do
  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}
  schema "users" do
    field :username, :string
    field :email, :string
    field :password_hash, :string
    field :role, :string, default: "PLAYER"
    field :currency, :integer, default: 100
    field :is_banned, :boolean, default: false
    field :email_verified, :boolean, default: true
    field :email_verify_token, :string
    field :email_verify_expires, :naive_datetime
    field :login_streak, :integer, default: 0
    field :last_login_date, :date
    field :invite_code, :string
    field :referred_by, :integer

    has_many :characters, TePhoenix.Game.Character, foreign_key: :user_id

    timestamps(inserted_at: :created_at, updated_at: false)
    field :last_login, :naive_datetime
  end
end
