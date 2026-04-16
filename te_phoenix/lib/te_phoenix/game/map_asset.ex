defmodule TePhoenix.Game.MapAsset do
  @moduledoc """
  Unified asset table — tilesets, sprites, audio, fonts, appearance layers.
  Content-addressed by SHA256 for deduplication and CDN-friendly caching.

  Extends the pre-existing legacy `game_assets` table with `sha256`,
  `metadata_json`, and `cdn_url` columns added in M0-3.
  """
  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}
  schema "game_assets" do
    field :filename, :string
    field :original_name, :string
    field :file_path, :string
    field :file_url, :string
    field :file_type, :string
    field :mime_type, :string
    field :file_size, :integer, default: 0
    field :width, :integer
    field :height, :integer
    field :tags, :string
    field :category, :string, default: "general"
    field :description, :string
    field :uploaded_by, :integer

    # M0-3 additions
    field :sha256, :string
    field :metadata_json, :string
    field :cdn_url, :string

    timestamps(inserted_at: :created_at, updated_at: false)
  end
end
