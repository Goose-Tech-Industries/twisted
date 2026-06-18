defmodule TePhoenixWeb.Components.AiAssist.SuggestionDiff do
  @moduledoc """
  Renders an AI-generated suggestion alongside the current value so
  the admin can see what would change before clicking Accept.

  * If `before` is empty/nil → renders the suggestion as a new value
    (no side-by-side diff, just "Suggested:")
  * If `before` is non-empty → splits the popover horizontally
    showing current value (left) and suggested value (right)

  Doesn't try to be a structural JSON differ — just a readable
  before/after for the human. The actual `Accept` flow hands the raw
  suggestion text back to the parent LV which decides how to merge.
  """

  use Phoenix.Component

  attr :before, :string, default: ""
  attr :after_value, :string, required: true
  attr :feature, :any, default: nil
  attr :tokens, :integer, default: 0
  attr :cost_cents, :integer, default: 0

  def suggestion_diff(assigns) do
    has_before = is_binary(assigns.before) and String.trim(assigns.before) != ""
    assigns = assign(assigns, :has_before, has_before)

    ~H"""
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <div class="text-[10px] uppercase tracking-wider text-zinc-500">
          {if @feature, do: "Suggestion · #{@feature.label}", else: "Suggestion"}
        </div>
        <div class="text-[10px] text-zinc-500 font-mono">
          {@tokens} tokens · {format_cents(@cost_cents)}
        </div>
      </div>

      <div :if={@has_before} class="grid grid-cols-2 gap-2">
        <div>
          <div class="text-[10px] uppercase tracking-wider text-zinc-600 mb-1">Current</div>
          <pre class="text-[11px] p-2 bg-zinc-900/40 border border-zinc-800 rounded
                      overflow-auto max-h-48 font-mono text-zinc-400 whitespace-pre-wrap"><%= @before %></pre>
        </div>
        <div>
          <div class="text-[10px] uppercase tracking-wider text-amber-400/80 mb-1">Suggested</div>
          <pre class="text-[11px] p-2 bg-amber-950/20 border border-amber-700/50 rounded
                      overflow-auto max-h-48 font-mono text-amber-100 whitespace-pre-wrap"><%= @after_value %></pre>
        </div>
      </div>

      <div :if={!@has_before}>
        <div class="text-[10px] uppercase tracking-wider text-amber-400/80 mb-1">Suggested</div>
        <pre class="text-[11px] p-2 bg-amber-950/20 border border-amber-700/50 rounded
                    overflow-auto max-h-64 font-mono text-amber-100 whitespace-pre-wrap"><%= @after_value %></pre>
      </div>
    </div>
    """
  end

  defp format_cents(0), do: "free"
  defp format_cents(c) when c < 100, do: "$0.0#{div(c, 10)}#{rem(c, 10)}"
  defp format_cents(c), do: "$#{div(c, 100)}.#{rem(c, 100) |> Integer.to_string() |> String.pad_leading(2, "0")}"
end
