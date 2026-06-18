defmodule TePhoenixWeb.Components.AiAssist.CostPreview do
  @moduledoc """
  Pre-fire cost estimate for an AI generation. Shows estimated tokens
  + cost in cents + remaining daily/weekly headroom for this user on
  this feature. Read-only.

  Estimation method: prompt size in chars / 4 + max_tokens (default
  1024). Sonnet 4.6 prices ~$3 per million input + $15 per million
  output → ~$0.018 / 1k mixed tokens at the default 1024-output cap.
  Real cost is logged from the provider's actual response.
  """

  use Phoenix.Component

  attr :prompt, :string, default: ""
  attr :feature, :any, default: nil
  attr :budget_left, :map, default: %{daily: 0, weekly: 0, daily_cap: 0, weekly_cap: 0}
  attr :max_tokens, :integer, default: 1024

  def cost_preview(assigns) do
    in_tokens = div(byte_size(assigns.prompt), 4) + 200
    out_tokens = assigns.max_tokens
    total = in_tokens + out_tokens
    cents = estimate_cents(in_tokens, out_tokens)
    headroom = headroom_class(assigns.budget_left, total)

    assigns =
      assigns
      |> assign(:in_tokens, in_tokens)
      |> assign(:out_tokens, out_tokens)
      |> assign(:total, total)
      |> assign(:cents, cents)
      |> assign(:headroom, headroom)

    ~H"""
    <div class="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Cost preview</div>
    <div class="grid grid-cols-2 gap-2 p-2 bg-zinc-900/60 border border-zinc-800 rounded text-[11px]">
      <div>
        <div class="text-zinc-500">Estimated</div>
        <div class="font-mono text-zinc-200">~{@total} tokens</div>
        <div class="font-mono text-zinc-400">≈ ${cents_to_dollars(@cents)}</div>
      </div>
      <div>
        <div class="text-zinc-500">Remaining today</div>
        <div class={[
          "font-mono",
          @headroom == :ok && "text-emerald-300",
          @headroom == :warn && "text-amber-300",
          @headroom == :over && "text-rose-300"
        ]}>
          {@budget_left.daily} / {@budget_left.daily_cap} tokens
        </div>
        <div class="font-mono text-zinc-500 text-[10px]">
          this week: {@budget_left.weekly} / {@budget_left.weekly_cap}
        </div>
      </div>
    </div>
    <p :if={@headroom == :over} class="text-[10px] text-rose-300 mt-1">
      ⚠ This generation would exceed your remaining budget. Try a shorter prompt or come back later.
    </p>
    """
  end

  defp estimate_cents(in_tokens, out_tokens) do
    # Sonnet 4.6: $3/M input, $15/M output. Round up so the preview
    # never under-quotes the user.
    in_cents = ceil(in_tokens * 0.0003)
    out_cents = ceil(out_tokens * 0.0015)
    max(in_cents + out_cents, 1)
  end

  defp cents_to_dollars(cents) when cents < 100, do: "0.0#{div(cents, 10)}#{rem(cents, 10)}"
  defp cents_to_dollars(cents), do: "#{div(cents, 100)}.#{:io_lib.format("~2..0B", [rem(cents, 100)])}"

  defp headroom_class(%{daily: d, daily_cap: cap}, total) when cap > 0 do
    cond do
      total > d -> :over
      d - total < cap * 0.2 -> :warn
      true -> :ok
    end
  end

  defp headroom_class(_, _), do: :ok
end
