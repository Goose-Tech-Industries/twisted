defmodule TePhoenix.Battle.FormulaTest do
  use ExUnit.Case, async: true

  alias TePhoenix.Battle.Formula

  describe "Formula.evaluate/2 basic arithmetic" do
    test "evaluates simple addition" do
      result = Formula.evaluate("ATK + DEF", %{"ATK" => 10, "DEF" => 5})
      assert result == 15.0
    end

    test "evaluates simple subtraction" do
      result = Formula.evaluate("ATK - DEF", %{"ATK" => 20, "DEF" => 8})
      assert result == 12.0
    end

    test "evaluates multiplication" do
      result = Formula.evaluate("ATK * 2", %{"ATK" => 14})
      assert result == 28.0
    end

    test "evaluates division" do
      result = Formula.evaluate("DEF / 2", %{"DEF" => 20})
      assert result == 10.0
    end

    test "respects standard operator precedence" do
      result = Formula.evaluate("ATK * 2 - DEF", %{"ATK" => 15, "DEF" => 5})
      assert result == 25.0
    end

    test "respects parentheses for altered precedence" do
      result = Formula.evaluate("(ATK - DEF) * 2", %{"ATK" => 15, "DEF" => 5})
      assert result == 20.0
    end
  end

  describe "Formula.evaluate/2 multi-character and prefixed variables" do
    test "correctly distinguishes MHP and HP without substring overlap" do
      vars = %{"MHP" => 100, "HP" => 40}
      result = Formula.evaluate("MHP - HP", vars)
      assert result == 60.0
    end

    test "correctly distinguishes TMHP, THP, and HP" do
      vars = %{"TMHP" => 200, "THP" => 150, "HP" => 50}
      result = Formula.evaluate("TMHP - THP + HP", vars)
      assert result == 100.0
    end

    test "evaluates TLVL and LVL variables" do
      vars = %{"TLVL" => 12, "LVL" => 10}
      result = Formula.evaluate("TLVL - LVL", vars)
      assert result == 2.0
    end

    test "evaluates MMP and MP variables" do
      vars = %{"MMP" => 80, "MP" => 35}
      result = Formula.evaluate("MMP - MP", vars)
      assert result == 45.0
    end

    test "evaluates MO, MD, SPD, and LCK" do
      vars = %{"MO" => 30, "MD" => 10, "SPD" => 15, "LCK" => 5}
      result = Formula.evaluate("(MO - MD) + (SPD / LCK)", vars)
      assert result == 23.0
    end
  end

  describe "Formula.evaluate/2 floating point and complex formulas" do
    test "supports decimal multipliers in formulas" do
      result = Formula.evaluate("ATK * 1.5 - DEF * 0.5", %{"ATK" => 20, "DEF" => 10})
      assert result == 25.0
    end

    test "supports nested parentheses" do
      result = Formula.evaluate("((ATK + 5) * 2) - ((DEF + 2) * 3)", %{"ATK" => 10, "DEF" => 4})
      # (15 * 2) - (6 * 3) = 30 - 18 = 12
      assert result == 12.0
    end

    test "handles negative results" do
      result = Formula.evaluate("ATK - DEF", %{"ATK" => 5, "DEF" => 20})
      assert result == -15.0
    end

    test "handles zero values in variables" do
      result = Formula.evaluate("ATK + DEF", %{"ATK" => 0, "DEF" => 0})
      assert result == 0.0
    end

    test "handles large values without overflow" do
      result = Formula.evaluate("ATK * DEF", %{"ATK" => 10_000, "DEF" => 50_000})
      assert result == 500_000_000.0
    end
  end

  describe "Formula.evaluate/2 safety and fallback handling" do
    test "falls back to 0.0 on division by zero" do
      result = Formula.evaluate("ATK / DEF", %{"ATK" => 50, "DEF" => 0})
      assert result == 0.0
    end

    test "falls back to 0.0 when invalid characters are injected" do
      result = Formula.evaluate("ATK; System.cmd('whoami')", %{"ATK" => 10})
      assert result == 0.0
    end

    test "falls back to 0.0 on alphabetic characters not in vars" do
      result = Formula.evaluate("ATK + UNKNOWN_VAR", %{"ATK" => 10})
      assert result == 0.0
    end

    test "falls back to 0.0 on malformed syntax" do
      result = Formula.evaluate("ATK + * DEF", %{"ATK" => 10, "DEF" => 5})
      assert result == 0.0
    end

    test "falls back to 0.0 on unmatched opening parenthesis" do
      result = Formula.evaluate("(ATK + DEF", %{"ATK" => 10, "DEF" => 5})
      assert result == 0.0
    end

    test "falls back to 0.0 on unmatched closing parenthesis" do
      result = Formula.evaluate("ATK + DEF)", %{"ATK" => 10, "DEF" => 5})
      assert result == 0.0
    end

    test "falls back to 0.0 on empty formula string" do
      assert Formula.evaluate("", %{"ATK" => 10}) == 0.0
    end

    test "falls back to 0.0 on nil formula" do
      assert Formula.evaluate(nil, %{"ATK" => 10}) == 0.0
    end

    test "falls back to 0.0 on non-map vars" do
      assert Formula.evaluate("ATK + 5", nil) == 0.0
    end
  end
end
