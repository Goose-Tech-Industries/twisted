defmodule TePhoenixWeb.MapEditorPresence do
  @moduledoc """
  Phoenix.Presence tracker for live map editor sessions. Each mounted
  `MapEditorLive` process tracks itself on topic `map:{id}:editor` with
  its editor_id + display name + cursor color. When the LiveView process
  exits (tab closed, disconnect), Presence emits a leave diff which the
  other editors use to prune stale cursor overlays.
  """
  use Phoenix.Presence,
    otp_app: :te_phoenix,
    pubsub_server: TePhoenix.PubSub
end
