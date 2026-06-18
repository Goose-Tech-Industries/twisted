defmodule TePhoenixWeb.Components.VisualPreview.ComboSequence do
  @moduledoc """
  Tier α P4 — visual chain of inputs for a combo art / fighting sequence.

      <.combo_sequence inputs={["←", "↓", "→", "A", "B"]} title="Hadouken+" />
  """

  use Phoenix.Component

  attr :inputs, :list, required: true,
       doc: "List of input glyphs as strings"

  attr :title, :string, default: nil
  attr :timing_ms, :integer, default: nil,
       doc: "Optional input window in ms (just metadata for label)"

  def combo_sequence(assigns) do
    ~H"""
    <div class="bg-zinc-900/50 border border-zinc-800 rounded p-2 space-y-1">
      <div :if={@title} class="text-[10px] uppercase tracking-wide text-zinc-500">{@title}</div>
      <div class="flex items-center gap-1 flex-wrap">
        <%= for {input, idx} <- Enum.with_index(@inputs) do %>
          <span class={[
            "inline-flex items-center justify-center px-2 py-1 min-w-[28px] h-8 rounded font-mono font-bold border",
            input_class(input)
          ]}>{input}</span>
          <span :if={idx < length(@inputs) - 1} class="text-zinc-600 text-xs">›</span>
        <% end %>
        <span :if={@inputs == []} class="text-[10px] text-zinc-600 italic">No inputs</span>
      </div>
      <div :if={@timing_ms} class="text-[9px] text-zinc-600 font-mono pt-0.5">
        ≤ {@timing_ms}ms between inputs
      </div>
    </div>
    """
  end

  defp input_class(input) when input in ["←", "→", "↑", "↓", "↖", "↗", "↘", "↙"] do
    "bg-zinc-800 border-zinc-600 text-zinc-200"
  end

  defp input_class(input) when input in ["A", "B", "C", "X", "Y", "Z", "L", "R"] do
    "bg-amber-900/40 border-amber-600 text-amber-300"
  end

  defp input_class(_), do: "bg-violet-900/40 border-violet-600 text-violet-300"
end
