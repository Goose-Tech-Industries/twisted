defmodule TePhoenixWeb.Components.VisualPreview.DamageFormulaCard do
  @moduledoc """
  Tier α P4 — preview a damage formula across a level range. Renders a
  small line graph (sparkline-style) showing damage scaling.

      <.damage_formula_card
        formula="ATK*1.5 + LVL*3"
        levels={1..50}
        attacker_atk={20} />

  This is a static preview — formulas are evaluated with placeholder
  ATK/DEF/LVL bindings, NOT through the live game's evaluator. Treat
  output as illustrative, not authoritative.
  """

  use Phoenix.Component

  attr :formula, :string, required: true
  attr :levels, :any, default: nil,
       doc: "Range or list of levels to plot. Defaults to 1..40."
  attr :attacker_atk, :integer, default: 20
  attr :defender_def, :integer, default: 10
  attr :title, :string, default: nil

  def damage_formula_card(assigns) do
    levels = assigns.levels || 1..40

    points =
      Enum.map(levels, fn lvl ->
        {lvl, eval_formula(assigns.formula, lvl, assigns.attacker_atk, assigns.defender_def)}
      end)

    max_dmg = points |> Enum.map(&elem(&1, 1)) |> Enum.max(fn -> 1 end) |> max(1)

    assigns =
      assigns
      |> assign(:points, points)
      |> assign(:max_dmg, max_dmg)
      |> assign(:level_count, Enum.count(levels))

    ~H"""
    <div class="bg-zinc-900/50 border border-zinc-800 rounded p-2 space-y-2">
      <div :if={@title} class="text-[10px] uppercase tracking-wide text-zinc-500">{@title}</div>
      <div class="text-xs font-mono text-amber-300 bg-zinc-950 px-2 py-1 rounded">
        {@formula}
      </div>
      <div class="text-[9px] text-zinc-500">
        ATK <span class="text-zinc-300">{@attacker_atk}</span> · DEF <span class="text-zinc-300">{@defender_def}</span>
      </div>
      <svg viewBox={"0 0 #{@level_count * 4} 60"} class="w-full h-16 bg-zinc-950 rounded">
        <polyline
          fill="none"
          stroke="#f59e0b"
          stroke-width="1.5"
          points={Enum.map_join(@points, " ", fn {lvl, dmg} ->
            x = (lvl - 1) * 4
            y = 60 - Float.round(dmg / @max_dmg * 56, 1)
            "#{x},#{y}"
          end)} />
      </svg>
      <div class="flex justify-between text-[9px] text-zinc-600 font-mono">
        <span>L1: {elem(hd(@points), 1) |> trunc()}</span>
        <span>peak: {trunc(@max_dmg)}</span>
        <span>L{@level_count}: {elem(List.last(@points), 1) |> trunc()}</span>
      </div>
    </div>
    """
  end

  # Tiny formula evaluator — supports ATK/DEF/LVL/MAXHP placeholders +
  # arithmetic ops + parens. Whitelist-validates the input first so
  # `Code.eval_string` can't run arbitrary Elixir (admin-facing UI but
  # still: don't let a stored formula become a live RCE).
  defp eval_formula(formula, lvl, atk, def_) do
    substituted =
      formula
      |> String.replace("MAXHP", "100")
      |> String.replace("ATK", to_string(atk))
      |> String.replace("DEF", to_string(def_))
      |> String.replace("LVL", to_string(lvl))

    if Regex.match?(~r/\A[\d\s\+\-\*\/\.\(\)]+\z/, substituted) do
      try do
        substituted
        |> Code.eval_string([], __ENV__)
        |> elem(0)
        |> to_float()
      rescue
        _ -> 0
      catch
        _, _ -> 0
      end
    else
      0
    end
  end

  defp to_float(n) when is_number(n), do: n * 1.0
  defp to_float(_), do: 0.0
end
