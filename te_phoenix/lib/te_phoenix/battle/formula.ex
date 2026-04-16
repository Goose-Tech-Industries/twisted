defmodule TePhoenix.Battle.Formula do
  @moduledoc """
  Safe formula evaluator for damage calculations.
  Replaces the JS safeEval — only allows arithmetic on known variables.
  Supports: ATK, DEF, MO, MD, SPD, LCK, LVL, HP, MHP, MP, MMP, TLVL, THP, TMHP
  Operators: +, -, *, /, parentheses
  """

  @doc """
  Evaluate a damage formula string with the given variable map.
  Returns a float result. Falls back to 0 on parse error.

  ## Examples

      iex> Formula.evaluate("ATK*2-DEF", %{"ATK" => 15, "DEF" => 5})
      25.0
  """
  def evaluate(formula, vars) when is_binary(formula) and is_map(vars) do
    # Replace variable names with their values (longest match first to avoid partial replacement)
    sorted_vars =
      vars
      |> Enum.sort_by(fn {k, _v} -> -String.length(k) end)

    substituted =
      Enum.reduce(sorted_vars, formula, fn {name, value}, acc ->
        String.replace(acc, name, to_string(value))
      end)

    # Validate: only digits, operators, parens, dots, spaces
    if Regex.match?(~r/^[\d\s\+\-\*\/\.\(\)]+$/, substituted) do
      try do
        {result, _} = Code.eval_string("1.0 * (#{substituted})")
        result / 1.0
      rescue
        _ -> 0.0
      end
    else
      0.0
    end
  end

  def evaluate(_, _), do: 0.0
end
