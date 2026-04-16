defmodule TePhoenix.Game.MapTileset do
  @moduledoc """
  Tileset metadata. References an asset row (the atlas image) and carries
  the parameters needed to slice it into individual tiles, plus per-tileset
  metadata like animation frame groups and Wang-tile auto-tiling rules.
  """
  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}
  schema "game_tilesets" do
    field :name, :string
    field :tile_width, :integer, default: 32
    field :tile_height, :integer, default: 32
    field :margin, :integer, default: 0
    field :spacing, :integer, default: 0
    field :columns, :integer
    field :rows, :integer
    field :metadata_json, :string

    belongs_to :asset, TePhoenix.Game.MapAsset, foreign_key: :asset_id

    timestamps(inserted_at: :created_at, updated_at: false)
  end
end
