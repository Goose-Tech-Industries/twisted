defmodule TePhoenixWeb.Admin.HubCrud do
  @moduledoc """
  Shared macro for admin hub pages. Generates mount + handle_event handlers.
  Each hub must define its own render/1 that calls HubCrudComponents.hub_page/1.
  """

  defmacro __using__(opts) do
    per_page = Keyword.fetch!(opts, :per_page)
    tab_config = Keyword.fetch!(opts, :tab_config)
    hub_title = Keyword.fetch!(opts, :hub_title)
    active_tab = Keyword.fetch!(opts, :active_tab)
    # Tier α-AI: optional per-tab AI feature mapping. Hubs declare
    # `ai_features: %{"game_classes" => "class_stat_block", ...}` and
    # the ✨ button auto-renders next to "+ New" when the active tab
    # has a registered feature.
    #
    # `Keyword.get(opts, :ai_features)` returns either the AST of the
    # map literal (when the caller wrote a literal) OR a real map
    # (default %{}). We materialize via `Code.eval_quoted/1` so the
    # value at runtime is always a plain map. Then `Macro.escape` re-
    # quotes it for safe injection into the generated code.
    ai_features =
      case Keyword.get(opts, :ai_features, %{}) do
        %{} = m ->
          m

        ast when is_tuple(ast) ->
          {value, _} = Code.eval_quoted(ast)
          if is_map(value), do: value, else: %{}

        _ ->
          %{}
      end

    quote do
      import TePhoenixWeb.Admin.CrudHelpers
      import TePhoenixWeb.Admin.HubCrudComponents

      @per_page unquote(per_page)
      @tab_config unquote(tab_config)
      @hub_title unquote(hub_title)

      # ai_features is now a materialized map (Code.eval_quoted ran in
      # the macro). Macro.escape re-quotes it so the runtime gets a
      # literal map expression in the function body.
      def __ai_features__, do: unquote(Macro.escape(ai_features))

      @impl true
      def mount(_params, _session, socket) do
        {_l, first} = hd(@tab_config)
        {:ok, socket
         |> assign(active_tab: unquote(active_tab), tab: first, tab_config: @tab_config,
            hub_title: @hub_title, per_page: @per_page, search: "", page: 1, rows: [],
            columns: [], column_types: %{}, total: 0, current_table: first,
            editing: nil, creating: false, form_data: %{}, form_errors: [],
            ai_features: __ai_features__())
         |> load_tab_data(first, per_page: @per_page)}
      end

      @impl true
      def handle_event("change_tab", %{"tab" => t}, s) do
        {:noreply, assign(s, tab: t, search: "", page: 1, editing: nil, creating: false) |> load_tab_data(t, per_page: @per_page)}
      end
      def handle_event("search", %{"search" => q}, s), do: {:noreply, assign(s, search: q, page: 1) |> load_tab_data(s.assigns.tab, per_page: @per_page)}
      def handle_event("prev_page", _, s), do: {:noreply, assign(s, page: max(1, s.assigns.page - 1)) |> load_tab_data(s.assigns.tab, per_page: @per_page)}
      def handle_event("next_page", _, s) do
        max_p = max(1, ceil(s.assigns.total / @per_page))
        {:noreply, assign(s, page: min(max_p, s.assigns.page + 1)) |> load_tab_data(s.assigns.tab, per_page: @per_page)}
      end
      def handle_event("new", _, s) do
        defaults = for {c, m} <- s.assigns.column_types, c != "id", into: %{}, do: {c, m.default || ""}
        {:noreply, assign(s, creating: true, editing: nil, form_data: defaults, form_errors: [])}
      end
      def handle_event("save_new", params, s) do
        form = params["entity"] || %{}
        case create_record(s.assigns.tab, form, s.assigns.column_types) do
          :ok -> {:noreply, s |> assign(creating: false, form_data: %{}, form_errors: []) |> put_flash(:info, "Created!") |> load_tab_data(s.assigns.tab, per_page: @per_page)}
          {:error, msg} -> {:noreply, assign(s, form_errors: [msg])}
        end
      end
      def handle_event("edit", %{"id" => id}, s) do
        row = Enum.find(s.assigns.rows, &(to_string(&1["id"]) == to_string(id)))
        if row do
          form = for {k, v} <- row, into: %{}, do: {k, if(is_nil(v), do: "", else: to_string(v))}
          {:noreply, assign(s, editing: row, creating: false, form_data: form, form_errors: [])}
        else {:noreply, s} end
      end
      def handle_event("save_edit", params, s) do
        form = params["entity"] || %{}
        case update_record(s.assigns.tab, s.assigns.editing["id"], form, s.assigns.columns, s.assigns.column_types) do
          :ok -> {:noreply, s |> assign(editing: nil, form_data: %{}, form_errors: []) |> put_flash(:info, "Updated!") |> load_tab_data(s.assigns.tab, per_page: @per_page)}
          {:error, msg} -> {:noreply, assign(s, form_errors: [msg])}
        end
      end
      def handle_event("delete", %{"id" => id}, s) do
        case delete_record(s.assigns.tab, id) do
          :ok -> {:noreply, s |> put_flash(:info, "Deleted!") |> load_tab_data(s.assigns.tab, per_page: @per_page)}
          {:error, msg} -> {:noreply, put_flash(s, :error, msg)}
        end
      end
      def handle_event("cancel_form", _, s), do: {:noreply, assign(s, editing: nil, creating: false, form_data: %{}, form_errors: [])}
      def handle_event("update_form", %{"entity" => d}, s), do: {:noreply, assign(s, form_data: Map.merge(s.assigns.form_data, d))}

      # Tier α-AI: generic accept handler for hub-level AiAssist.
      # Parses JSON suggestion, merges every top-level scalar field into
      # form_data (so the user's open form pre-fills with the suggestion).
      # Lists / maps get JSON-stringified into the matching field. Never
      # auto-saves — user reviews + clicks Save in the existing form.
      def handle_event("ai:apply_hub_suggestion", %{"suggestion" => json}, s) do
        merged =
          case Jason.decode(json) do
            {:ok, %{} = parsed} ->
              Enum.reduce(parsed, s.assigns.form_data, fn {k, v}, acc ->
                Map.put(acc, to_string(k), TePhoenixWeb.Admin.HubCrud.stringify(v))
              end)

            _ ->
              Map.put(s.assigns.form_data, "description", json)
          end

        {:noreply,
         s
         |> assign(form_data: merged, creating: s.assigns.creating || s.assigns.editing == nil, editing: s.assigns.editing)
         |> put_flash(:info, "AI suggestion applied — review and Save to commit.")}
      end

      def handle_event("ai:apply_hub_suggestion", _, s), do: {:noreply, s}

      # Phase 1.5b — Test Craft button (recipes tab only). Runs the
      # selected recipe against the calling admin's first character
      # with prerequisites bypassed. Useful for designers verifying
      # that a recipe's ingredients + output wiring works without
      # grinding a test character through level + learn first.
      # Phase 1.5d — Test Cast button (spells tab only). Bypasses the
      # capability gate (admin tools should work even when magic is
      # disabled for end users), force-unlocks any missing oghams on
      # the test character so the spell's pattern resolves, then runs
      # Magic.cast/3 with skip_prerequisites semantics: ie, ensure
      # the character has every ogham + spell learned before calling.
      def handle_event("test_cast", %{"id" => spell_id_str}, s) do
        spell_id = case Integer.parse(to_string(spell_id_str)) do
          {n, _} -> n
          _ -> 0
        end

        char_id = TePhoenixWeb.Admin.HubCrud.resolve_test_character(s)

        cond do
          spell_id == 0 ->
            {:noreply, put_flash(s, :error, "Bad spell id.")}

          is_nil(char_id) ->
            {:noreply, put_flash(s, :error, "Test Cast needs a character — create one first via /sauce/characters/create.")}

          true ->
            TePhoenixWeb.Admin.HubCrud.test_cast_spell(char_id, spell_id, s)
        end
      end

      def handle_event("test_craft", %{"id" => recipe_id_str}, s) do
        recipe_id = case Integer.parse(to_string(recipe_id_str)) do
          {n, _} -> n
          _ -> 0
        end

        char_id = TePhoenixWeb.Admin.HubCrud.resolve_test_character(s)

        cond do
          recipe_id == 0 ->
            {:noreply, put_flash(s, :error, "Bad recipe id.")}

          is_nil(char_id) ->
            {:noreply, put_flash(s, :error, "Test Craft needs a character. Create one first via /sauce/characters/create.")}

          true ->
            case TePhoenix.Game.Crafting.craft(char_id, recipe_id, skip_prerequisites: true) do
              {:ok, %{output_item_id: out_id, qty: qty, skill_xp_awarded: xp}} ->
                {:noreply, put_flash(s, :info, "Crafted recipe #{recipe_id}: +#{qty}× item ##{out_id}, #{xp} XP")}

              {:error, {:missing_ingredients, missing}} ->
                names = Enum.map_join(missing, ", ", fn m -> "#{m.need - m.have}× #{m[:name] || m.item_id}" end)
                {:noreply, put_flash(s, :error, "Recipe #{recipe_id} missing ingredients: #{names}")}

              {:error, reason} ->
                {:noreply, put_flash(s, :error, "Test craft failed: #{inspect(reason)}")}
            end
        end
      end

      @impl true
      def render(assigns) do
        assigns = assign(assigns,
          max_page: max(1, ceil(assigns.total / assigns.per_page)),
          show_form: assigns.creating || assigns.editing != nil,
          form_title: if(assigns.creating, do: "Create New", else: "Edit ##{assigns.editing && assigns.editing["id"]}"),
          editable_cols: (assigns.columns || []) -- ["id"],
          tab_label: Enum.find_value(assigns.tab_config, assigns.tab, fn {l, t} -> if t == assigns.tab, do: l end)
        )
        hub_page(assigns)
      end
    end
  end

  @doc false
  # Pick a character for the admin's Test Craft button. Prefer the
  # signed-in user's first character; fall back to character #1 if the
  # admin has none (so the engine doesn't need test scaffolding to
  # exist before designers can poke at recipes).
  def resolve_test_character(socket) do
    user_id = socket.assigns[:session_user_id]

    case TePhoenix.Repo.query(
           "SELECT id FROM characters WHERE user_id = ? ORDER BY id LIMIT 1",
           [user_id]
         ) do
      {:ok, %{rows: [[char_id]]}} ->
        char_id

      _ ->
        case TePhoenix.Repo.query("SELECT id FROM characters ORDER BY id LIMIT 1") do
          {:ok, %{rows: [[char_id]]}} -> char_id
          _ -> nil
        end
    end
  end

  @doc false
  # Phase 1.5d Test Cast — admin-side spell verification.
  # Looks up the spell by id, force-unlocks any oghams the test
  # character is missing (with source="test_cast"), force-learns the
  # spell, refills anam, clears the cooldown, then runs Magic.cast/3
  # against the test character themselves as target. Returns a flash
  # with the cast result so designers can verify effect_json wiring.
  def test_cast_spell(char_id, spell_id, s) do
    alias TePhoenix.Game.Magic
    alias TePhoenix.Repo

    Magic.ensure_schema()

    case Repo.query("SELECT `key`, name, ogham_pattern_json FROM game_spells WHERE id = ? LIMIT 1", [spell_id]) do
      {:ok, %{rows: [[spell_key, spell_name, pattern_json]]}} ->
        # 1. Force-unlock every ogham in the pattern
        pattern =
          case Jason.decode(to_string(pattern_json || "[]")) do
            {:ok, list} when is_list(list) -> list
            _ -> []
          end

        Enum.each(pattern, fn ogham_name ->
          Magic.unlock_ogham(char_id, to_string(ogham_name), "test_cast")
        end)

        # 2. Force-learn the spell (idempotent)
        case Repo.query("SELECT 1 FROM character_known_spells WHERE character_id = ? AND spell_id = ?", [char_id, spell_id]) do
          {:ok, %{rows: [[1]]}} ->
            :ok

          _ ->
            Repo.query("INSERT INTO character_known_spells (character_id, spell_id) VALUES (?, ?)", [char_id, spell_id])
        end

        # 3. Refill anam + clear cooldown
        Repo.query("UPDATE characters SET anam_current = anam_max WHERE id = ?", [char_id])
        Magic.reset_cooldowns(char_id)

        # 4. Cast (target_opts.target_id = caster, since admin tests
        #    against themselves by default)
        case Magic.cast(char_id, spell_key, %{"target_id" => char_id}) do
          {:ok, result} ->
            {:noreply,
             Phoenix.LiveView.put_flash(s, :info,
               "Test Cast succeeded: #{spell_name}. Effects: #{inspect(result[:applied_effects])}. Anam left: #{result[:anam_remaining]}")}

          {:error, reason} ->
            {:noreply, Phoenix.LiveView.put_flash(s, :error, "Test Cast failed: #{inspect(reason)}")}
        end

      _ ->
        {:noreply, Phoenix.LiveView.put_flash(s, :error, "Spell ##{spell_id} not found.")}
    end
  end

  @doc false
  def stringify(v) when is_binary(v), do: v
  def stringify(v) when is_number(v), do: to_string(v)
  def stringify(v) when is_boolean(v), do: to_string(v)
  def stringify(nil), do: ""
  def stringify(v), do: Jason.encode!(v)
end
