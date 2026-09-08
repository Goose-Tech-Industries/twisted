defmodule TePhoenixWeb.Game.LookupHandler do
  @moduledoc """
  Gameplay panel data lookups: bank, bounties, mounts, creatures, jobs, cards.
  Ported from socket-game.js panel data sections.
  All are simple DB reads — no state mutation.
  """

  import Phoenix.Channel

  alias TePhoenix.Repo

  def handle("bank_get_items", _payload, socket) do
    char_id = socket.assigns[:char_id]

    items = case Repo.query(
      "SELECT b.id, b.item_id, b.quantity, i.name, i.icon, i.rarity FROM character_bank b JOIN game_items i ON i.id=b.item_id WHERE b.character_id=?",
      [char_id]
    ) do
      {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end

    push(socket, "bank_items", %{items: items})
    {:noreply, socket}
  end

  def handle("bounty_get_tasks", _payload, socket) do
    tasks = case Repo.query(
      "SELECT bt.*, bb.name AS board_name FROM game_bounty_tasks bt JOIN game_bounty_boards bb ON bb.id=bt.board_id WHERE bt.is_active=1 ORDER BY bt.reward_gold DESC"
    ) do
      {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end

    push(socket, "bounty_tasks", %{tasks: tasks})
    {:noreply, socket}
  end

  def handle("mount_get_list", _payload, socket) do
    char_id = socket.assigns[:char_id]

    mounts = case Repo.query(
      "SELECT cm.id, cm.mount_id, cm.is_active, m.name, m.icon, m.speed_bonus FROM character_mounts cm JOIN game_mounts m ON m.id=cm.mount_id WHERE cm.character_id=?",
      [char_id]
    ) do
      {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end

    push(socket, "mount_list", %{mounts: mounts})
    {:noreply, socket}
  end

  def handle("creature_get_list", _payload, socket) do
    char_id = socket.assigns[:char_id]

    creatures = case Repo.query(
      "SELECT * FROM character_creatures WHERE character_id=?",
      [char_id]
    ) do
      {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end

    push(socket, "creature_list", %{creatures: creatures})
    {:noreply, socket}
  end

  def handle("job_get_list", _payload, socket) do
    char_id = socket.assigns[:char_id]

    jobs = case Repo.query(
      "SELECT cj.job_id, cj.job_level, cj.job_xp, cj.is_primary, cj.is_secondary, j.name, j.icon, j.description FROM character_jobs cj JOIN game_jobs j ON j.id=cj.job_id WHERE cj.character_id=?",
      [char_id]
    ) do
      {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end

    push(socket, "job_list", %{jobs: jobs})
    {:noreply, socket}
  end

  def handle("card_get_collection", _payload, socket) do
    char_id = socket.assigns[:char_id]

    cards = case Repo.query(
      "SELECT cc.card_id, cc.quantity, c.name, c.icon, c.rarity, c.value_top, c.value_right, c.value_bottom, c.value_left, c.element FROM character_cards cc JOIN game_cards c ON c.id=cc.card_id WHERE cc.character_id=?",
      [char_id]
    ) do
      {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end

    push(socket, "card_collection", %{cards: cards})
    {:noreply, socket}
  end

  def handle(_, _, socket), do: {:noreply, socket}
end
