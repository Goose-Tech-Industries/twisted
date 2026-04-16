defmodule TePhoenix.Game.MapDraft do
  @moduledoc """
  Per-user autosave target for the map editor. Every edit writes here
  at 2s cadence. `Apply` promotes the draft into a new version on the
  main branch.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :id, autogenerate: true}
  schema "game_map_drafts" do
    field :map_id, :integer
    field :user_id, :integer
    field :draft_json, :string

    timestamps(inserted_at: false, updated_at: :updated_at)
  end

  def changeset(draft, attrs) do
    draft
    |> cast(attrs, [:map_id, :user_id, :draft_json])
    |> validate_required([:map_id, :user_id, :draft_json])
  end
end
