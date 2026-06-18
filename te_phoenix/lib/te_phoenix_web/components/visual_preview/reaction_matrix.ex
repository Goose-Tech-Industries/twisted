defmodule TePhoenixWeb.Components.VisualPreview.ReactionMatrix do
  @moduledoc """
  Tier α P4 — 2D grid of element reactions (fire+water=steam etc.).
  Shows the full N×N table with the result at each cell.

      <.reaction_matrix
        elements={["fire", "water", "earth", "air"]}
        reactions={%{
          {"fire", "water"} => "steam",
          {"fire", "air"} => "explosion",
          {"water", "earth"} => "mud",
          {"earth", "air"} => "dust"
        }} />
  """

  use Phoenix.Component

  attr :elements, :list, required: true
  attr :reactions, :map, required: true,
       doc: "%{{a, b} => result_string}"

  attr :title, :string, default: nil

  def reaction_matrix(assigns) do
    ~H"""
    <div class="bg-zinc-900/50 border border-zinc-800 rounded p-2 space-y-1 overflow-x-auto">
      <div :if={@title} class="text-[10px] uppercase tracking-wide text-zinc-500">{@title}</div>
      <table class="text-[10px] border-collapse">
        <thead>
          <tr>
            <th></th>
            <th :for={col <- @elements} class="px-1.5 py-1 text-zinc-400 capitalize text-center font-bold">
              {col}
            </th>
          </tr>
        </thead>
        <tbody>
          <%= for row <- @elements do %>
            <tr>
              <th class="px-1.5 py-1 text-zinc-400 capitalize text-right font-bold">{row}</th>
              <%= for col <- @elements do %>
                <td class={[
                  "px-1.5 py-1 text-center border border-zinc-800/50 min-w-[60px]",
                  row == col && "bg-zinc-950 text-zinc-700"
                ]}>
                  <%= if row == col do %>
                    <span>·</span>
                  <% else %>
                    <% result = reaction_for(@reactions, row, col) %>
                    <%= if result do %>
                      <span class="text-amber-400 font-bold">{result}</span>
                    <% else %>
                      <span class="text-zinc-700">—</span>
                    <% end %>
                  <% end %>
                </td>
              <% end %>
            </tr>
          <% end %>
        </tbody>
      </table>
    </div>
    """
  end

  defp reaction_for(reactions, a, b) do
    Map.get(reactions, {a, b}) || Map.get(reactions, {b, a}) ||
      Map.get(reactions, "#{a}+#{b}") || Map.get(reactions, "#{b}+#{a}")
  end
end
