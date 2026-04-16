defmodule TePhoenix.Game.SystemSetting do
  use Ecto.Schema

  @primary_key {:setting_key, :string, []}
  schema "system_settings" do
    field :setting_value, :string, default: ""
    field :description, :string

    timestamps(inserted_at: false, updated_at: :updated_at)
  end
end
