defmodule TePhoenixWeb.Components.VisualPreview.LootSimulator do
  @moduledoc """
  Tier α P4 — preview a loot table by running N synthetic rolls and
  rendering a histogram. Pure: doesn't hit the DB, doesn't grant
  anything; the table comes in as a structured prop.

      <.loot_simulator
        table={[
          %{item: "Gold", weight: 50, qty: "10-30"},
          %{item: "Iron Ore", weight: 30, qty: "1-2"},
          %{item: "Rare Gem", weight: 5, qty: "1"},
          %{item: "(nothing)", weight: 15, qty: "0"}
        ]}
        rolls={1000} />
  """

  use Phoenix.Component

  attr :table, :list, required: true,
       doc: "List of %{item, weight, qty} entries"

  attr :rolls, :integer, default: 1000

  attr :title, :string, default: nil

  def loot_simulator(assigns) do
    table =
      assigns.table
      |> Enum.map(fn entry ->
        %{
          item: Map.get(entry, :item) || Map.get(entry, "item") || "?",
          weight: max(Map.get(entry, :weight, Map.get(entry, "weight", 1)), 0),
          qty: Map.get(entry, :qty, Map.get(entry, "qty", "1"))
        }
      end)
      |> Enum.reject(&(&1.weight == 0))

    total_weight = Enum.sum(Enum.map(table, & &1.weight))

    counts =
      if total_weight > 0 do
        for _ <- 1..assigns.rolls, reduce: %{} do
          acc ->
            pick = roll_one(table, total_weight)
            Map.update(acc, pick.item, 1, &(&1 + 1))
        end
      else
        %{}
      end

    rows =
      table
      |> Enum.map(fn entry ->
        n = Map.get(counts, entry.item, 0)
        %{item: entry.item, expected: entry.weight / total_weight * assigns.rolls, actual: n, qty: entry.qty, weight: entry.weight}
      end)

    max_actual = rows |> Enum.map(& &1.actual) |> Enum.max(fn -> 1 end) |> max(1)
    assigns = assigns |> assign(:rows, rows) |> assign(:max_actual, max_actual)

    ~H"""
    <div class="bg-zinc-900/50 border border-zinc-800 rounded p-2 space-y-1">
      <div :if={@title} class="text-[10px] uppercase tracking-wide text-zinc-500">{@title}</div>
      <div class="text-[10px] text-zinc-500 mb-1">{@rolls} rolls · totals across the table</div>
      <div :for={row <- @rows} class="flex items-center gap-2 text-xs">
        <span class="w-28 truncate text-zinc-300">{row.item}</span>
        <span class="w-12 text-right text-[9px] text-zinc-600 font-mono">{row.qty}</span>
        <div class="flex-1 h-3 bg-zinc-950 rounded overflow-hidden">
          <div class="h-full bg-amber-600 transition-all"
            style={"width: #{Float.round(row.actual / @max_actual * 100, 1)}%"}>
          </div>
        </div>
        <span class="w-12 text-right font-mono text-amber-400">{row.actual}</span>
        <span class="w-14 text-right text-[9px] text-zinc-600 font-mono">~{Float.round(row.expected, 1)}</span>
      </div>
      <div :if={@rows == []} class="text-[10px] text-zinc-600 italic">Empty table</div>
    </div>
    """
  end

  defp roll_one(table, total_weight) do
    target = :rand.uniform() * total_weight

    {chosen, _} =
      Enum.reduce_while(table, {nil, 0}, fn entry, {_, acc} ->
        new_acc = acc + entry.weight
        if target <= new_acc, do: {:halt, {entry, new_acc}}, else: {:cont, {nil, new_acc}}
      end)

    chosen || List.last(table)
  end
end
