defmodule TePhoenixWeb.RaidChannel do
  @moduledoc """
  Per-raid-instance channel for raid boss system.
  Topic format: "raid:{instance_id}"

  Receives:
  - raid_update — party list, boss HP changes
  """

  use Phoenix.Channel

  @impl true
  def join("raid:" <> _instance_id, _params, socket) do
    {:ok, socket}
  end

  @impl true
  def handle_in(_event, _payload, socket), do: {:noreply, socket}
end
