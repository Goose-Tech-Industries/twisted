defmodule TePhoenix.World.LegendChronicler do
  @moduledoc """
  Living Legend Chronicler: Permanently weaves player exploits, companion heroics,
  and infamous "LEEROY JENKINS!" charges into tavern songs, NPC rumors, and world history.
  """

  use GenServer
  require Logger

  @max_legends 50

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(_opts) do
    {:ok, []}
  end

  @doc "Records a legendary player or party exploit into the world's permanent living lore."
  def record_legend(category, title, detail, opts \\ []) do
    GenServer.call(__MODULE__, {:record, category, title, detail, opts})
  end

  @doc "Retrieves the recent history of player legends and bardic songs."
  def recent_legends do
    GenServer.call(__MODULE__, :get_legends)
  end

  @impl true
  def handle_call({:record, category, title, detail, opts}, _from, legends) do
    participants = Keyword.get(opts, :participants, [])

    bard_song =
      case category do
        :battle_cry_charge ->
          "Hear the Ballad of #{title}! Where blades flashed and battle cries shook the stone, they charged reckless into glory!"

        :raid_clear ->
          "Raise your tankards for #{title}! The citadel was breached and the ancient titan fell before their companion host!"

        :tragic_wipe ->
          "A cautionary tale of #{title}: bravery turned to ash, but their names will forever echo in the deep vaults!"

        _ ->
          "A new chronicle is sung in the taverns: #{detail}"
      end

    entry = %{
      id: "leg_#{System.system_time(:millisecond)}",
      category: category,
      title: title,
      detail: detail,
      bard_song: bard_song,
      participants: participants,
      timestamp: System.system_time(:second)
    }

    # Broadcast to realm news & tavern bards
    try do
      TePhoenixWeb.Endpoint.broadcast("game:events", "legendary_tale", %{
        category: category,
        title: title,
        bard_song: bard_song,
        timestamp: entry.timestamp
      })
    rescue
      _ -> :ok
    end

    updated = Enum.take([entry | legends], @max_legends)
    {:reply, {:ok, entry}, updated}
  end

  @impl true
  def handle_call(:get_legends, _from, legends) do
    {:reply, legends, legends}
  end
end
