defmodule TePhoenixWeb.Components.RuleTreeBuilder.ValueInput do
  @moduledoc """
  Typed value input for a condition or action param. Renders the right
  control based on the param's declared `:type`:

    :integer, :float, :percent  → number input with optional bounds
    :string                     → text input
    :boolean                    → yes/no select
    :textarea                   → multi-line textarea
    :select                     → dropdown with `:options` (list of {value, label})
    :select_status              → dropdown populated from game_battle_statuses
    :select_surface             → dropdown populated from game_surfaces
    :select_npc                 → dropdown populated from game_npcs
    :select_map                 → dropdown populated from game_maps

  The select_* types resolve options live from the DB. The caller can
  pass a pre-resolved `:options` list to skip the lookup (useful on
  pages that already loaded the data).
  """

  use Phoenix.Component
  alias TePhoenix.Repo

  attr :name, :string, required: true
  attr :value, :any, default: nil
  attr :type, :atom, default: :string
  attr :options, :list, default: nil,
       doc: "[{value, label}] for :select; auto-resolved for :select_*."
  attr :placeholder, :string, default: nil
  attr :min, :any, default: nil
  attr :max, :any, default: nil
  attr :class, :string, default: ""

  def value_input(assigns) do
    case assigns.type do
      t when t in [:integer, :float, :percent] -> render_number(assigns)
      :boolean -> render_boolean(assigns)
      :textarea -> render_textarea(assigns)
      :select -> render_select(assigns, assigns.options || [])
      :select_status -> render_select(assigns, options_for(:status, assigns.options))
      :select_surface -> render_select(assigns, options_for(:surface, assigns.options))
      :select_npc -> render_select(assigns, options_for(:npc, assigns.options))
      :select_map -> render_select(assigns, options_for(:map, assigns.options))
      _ -> render_string(assigns)
    end
  end

  defp render_string(assigns) do
    ~H"""
    <input
      type="text"
      name={@name}
      value={to_string(@value || "")}
      placeholder={@placeholder}
      class={["bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs w-32", @class]} />
    """
  end

  defp render_number(assigns) do
    step = if assigns.type == :float or assigns.type == :percent, do: "any", else: "1"
    assigns = assign(assigns, :step, step)

    ~H"""
    <input
      type="number"
      name={@name}
      value={number_value(@value)}
      step={@step}
      min={@min}
      max={@max}
      placeholder={@placeholder}
      class={["bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs w-24", @class]} />
    """
  end

  defp render_boolean(assigns) do
    ~H"""
    <select name={@name} class={["bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs", @class]}>
      <option value="true" selected={truthy?(@value)}>Yes</option>
      <option value="false" selected={!truthy?(@value)}>No</option>
    </select>
    """
  end

  defp render_textarea(assigns) do
    ~H"""
    <textarea
      name={@name}
      rows="2"
      placeholder={@placeholder}
      class={["bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs w-full", @class]}><%= to_string(@value || "") %></textarea>
    """
  end

  defp render_select(assigns, options) do
    assigns = assign(assigns, :options, options)
    str_value = to_string(assigns.value || "")
    assigns = assign(assigns, :str_value, str_value)

    ~H"""
    <select name={@name} class={["bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs", @class]}>
      <option value="">— pick —</option>
      <option :for={{val, label} <- @options} value={val} selected={to_string(val) == @str_value}>
        {label}
      </option>
    </select>
    """
  end

  defp number_value(nil), do: ""
  defp number_value(n) when is_number(n), do: n
  defp number_value(s) when is_binary(s), do: s
  defp number_value(_), do: ""

  defp truthy?(true), do: true
  defp truthy?("true"), do: true
  defp truthy?(1), do: true
  defp truthy?("1"), do: true
  defp truthy?(_), do: false

  # ── live option resolution ──────────────────────────────────────

  defp options_for(_kind, list) when is_list(list), do: list

  defp options_for(:status, _) do
    case Repo.query("SELECT `key`, name FROM game_battle_statuses WHERE enabled=1 ORDER BY name ASC") do
      {:ok, %{rows: rows}} -> Enum.map(rows, fn [k, n] -> {k, n} end)
      _ -> []
    end
  rescue
    _ -> []
  end

  defp options_for(:surface, _) do
    case Repo.query("SELECT `key`, name FROM game_surfaces ORDER BY name ASC") do
      {:ok, %{rows: rows}} -> Enum.map(rows, fn [k, n] -> {k, n} end)
      _ -> []
    end
  rescue
    _ -> []
  end

  defp options_for(:npc, _) do
    case Repo.query("SELECT id, name FROM game_npcs WHERE is_active=1 ORDER BY name ASC LIMIT 200") do
      {:ok, %{rows: rows}} -> Enum.map(rows, fn [id, n] -> {id, n} end)
      _ -> []
    end
  rescue
    _ -> []
  end

  defp options_for(:map, _) do
    case Repo.query("SELECT id, name FROM game_maps ORDER BY name ASC") do
      {:ok, %{rows: rows}} -> Enum.map(rows, fn [id, n] -> {id, n} end)
      _ -> []
    end
  rescue
    _ -> []
  end

  defp options_for(_, _), do: []
end
