defmodule TePhoenix.Game.MapBranch do
  @moduledoc """
  Git-style map branches. Every map has a `main` branch created on first
  save; users can create additional branches (e.g. `staging`, `experiment`)
  and merge them back when ready.

  `layers_json` stores the frozen layer snapshot for the branch. Op history
  lives in `game_map_ops_log` keyed by branch_id.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :id, autogenerate: true}
  schema "game_map_branches" do
    field :map_id, :integer
    field :branch_name, :string, default: "main"
    field :parent_branch_id, :integer
    field :layers_json, :string
    field :created_by, :integer

    timestamps(inserted_at: :created_at, updated_at: :updated_at)
  end

  def changeset(branch, attrs) do
    branch
    |> cast(attrs, [:map_id, :branch_name, :parent_branch_id, :layers_json, :created_by])
    |> validate_required([:map_id, :branch_name])
    |> unique_constraint([:map_id, :branch_name], name: :uq_map_branch)
  end
end
