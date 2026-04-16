defmodule TePhoenix.Game.MapOp do
  @moduledoc """
  CRDT op log for the map editor. Every editor_op (paint tile, place event,
  move object, etc.) is persisted here for:

    - CRDT replay when a client reconnects after being offline
    - Scrubbable history / time-travel debugging
    - Audit trail of who changed what
    - Crash recovery

  Ops are keyed by (map_id, op_id) where op_id is a client-generated UUID —
  makes the op log idempotent under network retries.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :id, autogenerate: true}
  schema "game_map_ops_log" do
    field :map_id, :integer
    field :branch_id, :integer
    field :op_id, :string
    field :op_type, :string
    field :patch_json, :string
    field :author_id, :integer
    field :author_name, :string
    field :sequence, :integer, default: 0

    timestamps(inserted_at: :created_at, updated_at: false)
  end

  def changeset(op, attrs) do
    op
    |> cast(attrs, [
      :map_id,
      :branch_id,
      :op_id,
      :op_type,
      :patch_json,
      :author_id,
      :author_name,
      :sequence
    ])
    |> validate_required([:map_id, :op_id, :op_type, :patch_json])
    |> unique_constraint([:map_id, :op_id], name: :uq_map_op)
  end
end
