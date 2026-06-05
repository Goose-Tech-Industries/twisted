defmodule TePhoenixWeb.CraftingController do
  @moduledoc """
  REST surface for the crafting system. Thin wrapper around
  `TePhoenix.Game.Crafting` — every endpoint resolves the calling
  user → active character, then delegates to a single Crafting
  function.

  Phase 1.5b. Replaces the inline-SQL controller; preserves the
  `/recipes` + `/craft` routes the SvelteKit player already calls.
  """

  use TePhoenixWeb, :controller

  alias TePhoenix.AI.Gateway
  alias TePhoenix.Game.Crafting
  alias TePhoenix.Repo

  # ── Listing endpoints ────────────────────────────────────────────

  @doc """
  GET /api/crafting/recipes — list ALL active recipes the player can
  see, joined with their item names + a `discovered` flag against
  the per-character known set. The shape matches the SvelteKit
  CraftingPanel's `Recipe` interface so the UI keeps working.
  """
  def list_recipes(conn, _params) do
    char_id = current_character_id(conn)

    rows =
      query_rows("""
      SELECT r.id, r.name, r.description, r.icon, r.category,
             r.result_item_id, r.result_qty, r.level_req, r.skill_req,
             r.ingredients_json, r.unlock_mode,
             i.name AS result_name, i.icon AS result_icon
      FROM game_craft_recipes r
      LEFT JOIN game_items i ON i.id = r.result_item_id
      WHERE r.is_active = 1 AND r.hidden = 0
      ORDER BY r.level_req, r.name
      """)

    learned = if char_id, do: learned_set(char_id), else: MapSet.new()

    recipes =
      Enum.map(rows, fn r ->
        ings =
          case Jason.decode(to_string(r["ingredients_json"] || "[]")) do
            {:ok, list} when is_list(list) ->
              Enum.map(list, &normalize_ingredient/1)

            _ ->
              []
          end

        %{
          id: r["id"],
          name: r["name"],
          description: r["description"],
          icon: r["icon"],
          category: r["category"],
          result_item_id: r["result_item_id"],
          result_name: r["result_name"],
          result_icon: r["result_icon"],
          result_qty: r["result_qty"] || 1,
          required_level: r["level_req"] || 1,
          required_skill: r["skill_req"],
          ingredients: ings,
          discovered:
            r["unlock_mode"] == "ALWAYS" or MapSet.member?(learned, r["id"])
        }
      end)

    json(conn, %{success: true, recipes: recipes})
  end

  @doc "GET /api/crafting/known — only recipes the calling user has learned."
  def list_known(conn, _params) do
    case current_character_id(conn) do
      nil -> json(conn, %{success: false, message: "no character"})
      char_id -> json(conn, %{success: true, recipes: Crafting.list_known(char_id)})
    end
  end

  @doc "GET /api/crafting/available?station=forge — recipes craftable RIGHT NOW."
  def list_available(conn, params) do
    case current_character_id(conn) do
      nil ->
        json(conn, %{success: false, message: "no character"})

      char_id ->
        station = params["station"]
        json(conn, %{success: true, recipes: Crafting.list_available(char_id, station)})
    end
  end

  # ── Mutations ────────────────────────────────────────────────────

  @doc "POST /api/crafting/craft body: %{recipeId, qty?}"
  def craft_item(conn, %{"recipeId" => recipe_id} = params) do
    qty = parse_int(params["qty"], 1)

    case current_character_id(conn) do
      nil ->
        json(conn, %{success: false, message: "no character"})

      char_id ->
        case Crafting.craft(char_id, parse_int(recipe_id, 0), qty: qty) do
          {:ok, %{output_item_id: out_id, qty: out_qty} = result} ->
            name = lookup_item_name(out_id)

            json(conn, %{
              success: true,
              message: "Crafted #{out_qty}× #{name}!",
              output_item_id: out_id,
              qty: out_qty,
              skill_xp_awarded: result[:skill_xp_awarded] || 0
            })

          {:error, {:missing_ingredients, missing}} ->
            list = Enum.map_join(missing, ", ", fn m -> "#{m.need - m.have}× #{m.name}" end)
            json(conn, %{success: false, message: "Missing: #{list}", missing: missing})

          {:error, :level_too_low} ->
            json(conn, %{success: false, message: "Your level is too low for this recipe."})

          {:error, :recipe_not_learned} ->
            json(conn, %{success: false, message: "You haven't learned this recipe yet."})

          {:error, :recipe_not_found} ->
            json(conn, %{success: false, message: "Recipe not found."})

          {:error, :recipe_disabled} ->
            json(conn, %{success: false, message: "Recipe is currently disabled."})

          {:error, :race_condition} ->
            json(conn, %{success: false, message: "Ingredients changed mid-craft. Try again."})

          {:error, reason} ->
            json(conn, %{success: false, message: "Craft failed: #{inspect(reason)}"})
        end
    end
  end

  def craft_item(conn, _),
    do: json(conn, %{success: false, message: "recipeId required"})

  @doc "POST /api/crafting/learn body: %{recipeId}"
  def learn(conn, %{"recipeId" => recipe_id}) do
    case current_character_id(conn) do
      nil ->
        json(conn, %{success: false, message: "no character"})

      char_id ->
        case Crafting.learn(char_id, parse_int(recipe_id, 0)) do
          {:ok, :learned} -> json(conn, %{success: true, message: "Recipe learned."})
          {:ok, :already_known} -> json(conn, %{success: true, message: "Already known."})
          {:error, :level_too_low} -> json(conn, %{success: false, message: "Level too low to learn this."})
          {:error, :recipe_not_found} -> json(conn, %{success: false, message: "Recipe not found."})
          {:error, reason} -> json(conn, %{success: false, message: inspect(reason)})
        end
    end
  end

  def learn(conn, _),
    do: json(conn, %{success: false, message: "recipeId required"})

  # ── Admin Test Craft ─────────────────────────────────────────────

  @doc """
  POST /api/crafting/test_craft body: %{recipeId, characterId}
  Admin-only "Test Craft" used by the EconomyHub recipes tab.
  Bypasses level/learned/station gates so designers can verify
  recipe wiring without grinding a test character first.
  """
  def test_craft(conn, %{"recipeId" => recipe_id} = params) do
    if not staff?(conn) do
      json(conn, %{success: false, message: "unauthorized"})
    else
      char_id = parse_int(params["characterId"], current_character_id(conn) || 1)

      case Crafting.craft(char_id, parse_int(recipe_id, 0), skip_prerequisites: true) do
        {:ok, result} -> json(conn, %{success: true, result: result})
        {:error, reason} -> json(conn, %{success: false, message: inspect(reason)})
      end
    end
  end

  def test_craft(conn, _),
    do: json(conn, %{success: false, message: "recipeId + characterId required"})

  # ── Helpers ──────────────────────────────────────────────────────

  defp current_character_id(conn) do
    user_id = conn.assigns[:user_id] || (conn.private[:plug_session] || %{})["user_id"]

    if user_id do
      case Repo.query("SELECT id FROM characters WHERE user_id=? ORDER BY id LIMIT 1", [user_id]) do
        {:ok, %{rows: [[char_id]]}} -> char_id
        _ -> nil
      end
    end
  end

  defp staff?(conn) do
    role = conn.assigns[:user_role] || (conn.private[:plug_session] || %{})["role"] || "PLAYER"
    weight = TePhoenixWeb.Components.PowerUserField.role_weight(role)
    weight >= 60
  end

  # Quiet the unused-alias warning — Gateway is reserved for the
  # next batch (crafting AI assist) but not used in this controller.
  @doc false
  def __ai_gateway_ref__, do: Gateway

  defp learned_set(char_id) do
    case Repo.query(
           "SELECT recipe_id FROM character_learned_recipes WHERE character_id = ?",
           [char_id]
         ) do
      {:ok, %{rows: rows}} -> MapSet.new(rows, fn [r] -> r end)
      _ -> MapSet.new()
    end
  end

  defp lookup_item_name(item_id) do
    case Repo.query("SELECT name FROM game_items WHERE id = ?", [item_id]) do
      {:ok, %{rows: [[name]]}} -> name
      _ -> "item"
    end
  end

  defp normalize_ingredient(%{} = m) do
    %{
      item_id: m["item_id"] || m[:item_id],
      qty: m["qty"] || m[:qty] || m["quantity"] || m[:quantity] || 1,
      name: m["name"] || ""
    }
  end

  defp normalize_ingredient(_), do: %{item_id: nil, qty: 0, name: ""}

  defp query_rows(sql, params \\ []) do
    case Repo.query(sql, params) do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)

      _ ->
        []
    end
  end

  defp parse_int(nil, default), do: default

  defp parse_int(s, default) when is_binary(s) do
    case Integer.parse(s) do
      {i, _} -> i
      _ -> default
    end
  end

  defp parse_int(i, _) when is_integer(i), do: i
  defp parse_int(_, default), do: default
end
