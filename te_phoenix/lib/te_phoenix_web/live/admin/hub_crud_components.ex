defmodule TePhoenixWeb.Admin.HubCrudComponents do
  @moduledoc """
  Shared HEEx components for all admin hub CRUD pages.

  Now powered by SmartFields — every column automatically gets the
  right input type: dropdowns for foreign keys, rule builders for
  JSON columns, enum selects for known value sets, multi-select
  checkboxes for array columns. Zero per-table configuration needed.
  """
  use Phoenix.Component
  import TePhoenixWeb.Admin.CrudHelpers, only: [format_cell: 1, field_type: 2]
  alias TePhoenixWeb.Admin.{SmartFields, FieldDescriptions}

  def hub_page(assigns) do
    ~H"""
    <div>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold text-amber-400">{@hub_title}</h2>
        <button phx-click="new" class="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-black font-bold rounded-lg text-sm transition">
          + New {@tab_label}
        </button>
      </div>

      <%!-- Tab Bar --%>
      <div class="flex gap-1 mb-6 border-b border-zinc-800 pb-3 overflow-x-auto">
        <button :for={{label, table} <- @tab_config} phx-click="change_tab" phx-value-tab={table}
          class={["px-3 py-1.5 rounded-t text-xs font-medium transition-colors whitespace-nowrap",
            @tab == table && "bg-amber-600 text-white",
            @tab != table && "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"]}>
          {label}
        </button>
      </div>

      <%!-- Search + Pagination --%>
      <div class="flex items-center gap-3 mb-4 flex-wrap">
        <form phx-change="search" class="flex-1 max-w-xs">
          <input type="text" name="search" value={@search} placeholder="Search..."
            phx-debounce="300"
            class="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
        </form>
        <span class="text-xs text-zinc-500">{@total} records</span>
        <div class="ml-auto flex items-center gap-2">
          <button phx-click="prev_page" disabled={@page <= 1}
            class="px-2 py-1 bg-zinc-800 text-zinc-400 rounded text-xs hover:bg-zinc-700 disabled:opacity-30">Prev</button>
          <span class="text-xs text-zinc-500">{@page} / {@max_page}</span>
          <button phx-click="next_page" disabled={@page >= @max_page}
            class="px-2 py-1 bg-zinc-800 text-zinc-400 rounded text-xs hover:bg-zinc-700 disabled:opacity-30">Next</button>
        </div>
      </div>

      <%!-- Create / Edit Form Modal --%>
      <div :if={@show_form} class="fixed inset-0 bg-black/70 z-50 flex items-start justify-center pt-12 overflow-y-auto">
        <div class="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-3xl mb-12 shadow-2xl">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-bold text-amber-400">{@form_title} — {@tab_label}</h3>
            <button phx-click="cancel_form" class="text-zinc-500 hover:text-zinc-300 text-xl">&times;</button>
          </div>
          <div :for={err <- @form_errors} class="mb-3 p-2 bg-red-900/30 border border-red-700 rounded text-red-400 text-sm">{err}</div>
          <form phx-submit={if @creating, do: "save_new", else: "save_edit"} phx-change="update_form">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-2">
              <div :for={col <- @editable_cols} class={smart_col_class(col)}>
                <label class="text-xs font-bold text-zinc-500 uppercase tracking-wider">{humanize(col)}</label>
                <.smart_field col={col} val={@form_data[col] || ""} ftype={field_type(@column_types, col)} />
                <p :if={FieldDescriptions.get(col)} class="text-[10px] text-zinc-600 mt-0.5 leading-snug">{FieldDescriptions.get(col)}</p>
              </div>
            </div>
            <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-zinc-800">
              <button type="button" phx-click="cancel_form" class="px-4 py-2 bg-zinc-800 text-zinc-400 rounded-lg text-sm hover:bg-zinc-700">Cancel</button>
              <button type="submit" class="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-black font-bold rounded-lg text-sm transition">
                {if @creating, do: "Create", else: "Save"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <%!-- Data Table --%>
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-zinc-800 text-left">
              <th :for={col <- @columns}
                class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 whitespace-nowrap">{humanize(col)}</th>
              <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 w-24 sticky right-0 bg-zinc-900">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr :for={row <- @rows} class="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
              <td :for={col <- @columns}
                class="px-3 py-2 text-sm text-zinc-300 max-w-[200px] truncate whitespace-nowrap">{format_cell(row[col])}</td>
              <td class="px-3 py-2 flex gap-2 sticky right-0 bg-zinc-900">
                <button phx-click="edit" phx-value-id={row["id"]} class="text-xs text-amber-500 hover:text-amber-400 font-medium">Edit</button>
                <button phx-click="delete" phx-value-id={row["id"]} data-confirm={"Delete ##{row["id"]}?"}
                  class="text-xs text-red-500 hover:text-red-400">Del</button>
              </td>
            </tr>
          </tbody>
        </table>
        <div :if={@rows == []} class="p-8 text-center text-zinc-600 text-sm">No records</div>
      </div>
    </div>
    """
  end

  # ── Smart field rendering ──────────────────────────────────────
  # Inspects the column name and renders the appropriate no-code input.

  def smart_field(assigns) do
    smart = SmartFields.smart_type(assigns.col)

    assigns = put_assign(assigns, :smart, smart)
    render_smart_field(assigns)
  end

  # Foreign key → dropdown populated from referenced table
  defp render_smart_field(%{smart: {:fk, table}} = assigns) do
    options = SmartFields.fk_options(table)
    assigns = put_assign(assigns, :options, options)

    ~H"""
    <select name={"entity[#{@col}]"} class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500">
      <option value="">(none)</option>
      <%= for opt <- @options do %>
        <option value={opt.id} selected={to_string(@val) == to_string(opt.id)}>{opt.name} (#{opt.id})</option>
      <% end %>
    </select>
    """
  end

  # Enum → dropdown with known values
  defp render_smart_field(%{smart: {:enum, options}} = assigns) do
    assigns = put_assign(assigns, :options, options)

    ~H"""
    <select name={"entity[#{@col}]"} class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500">
      <option value="">(any)</option>
      <%= for opt <- @options do %>
        <option value={opt} selected={to_string(@val) == opt}>{opt}</option>
      <% end %>
    </select>
    """
  end

  # JSON column with rule builder schema
  defp render_smart_field(%{smart: {:rule_builder, schema}} = assigns) when not is_nil(schema) do
    assigns = put_assign(assigns, :schema, schema)

    ~H"""
    <.live_component
      module={TePhoenixWeb.Components.RuleBuilder}
      id={"hub_rb_#{@col}"}
      field_name={"entity[#{@col}]"}
      schema={@schema}
      label={humanize(@col)}
      value={@val}
    />
    """
  end

  # JSON column without specific schema → textarea (power users)
  defp render_smart_field(%{smart: {:rule_builder, nil}} = assigns) do
    ~H"""
    <textarea name={"entity[#{@col}]"} rows="3"
      class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 font-mono text-xs">{@val}</textarea>
    """
  end

  # Emoji picker hint
  defp render_smart_field(%{smart: :emoji} = assigns) do
    ~H"""
    <input type="text" name={"entity[#{@col}]"} value={@val} placeholder="🔥"
      class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 text-center text-lg" />
    """
  end

  # Textarea for long text
  defp render_smart_field(%{smart: :textarea} = assigns) do
    ~H"""
    <textarea name={"entity[#{@col}]"} rows="3"
      class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500">{@val}</textarea>
    """
  end

  # Default: fall back to basic field type detection
  defp render_smart_field(assigns) do
    ~H"""
    <.crud_field col={@col} val={@val} ftype={@ftype} />
    """
  end

  # ── Basic field components (fallback) ──────────────────────────

  def crud_field(%{ftype: :boolean} = assigns) do
    ~H"""
    <input type="checkbox" name={"entity[#{@col}]"} value="1" checked={@val in ["1", "true", true]}
      class="rounded bg-zinc-800 border-zinc-600 text-amber-500 focus:ring-amber-500" />
    """
  end

  def crud_field(%{ftype: :textarea} = assigns) do
    ~H"""
    <textarea name={"entity[#{@col}]"} rows="3"
      class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 font-mono">{@val}</textarea>
    """
  end

  def crud_field(%{ftype: :number} = assigns) do
    ~H"""
    <input type="number" name={"entity[#{@col}]"} value={@val}
      class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500" />
    """
  end

  def crud_field(assigns) do
    ~H"""
    <input type="text" name={"entity[#{@col}]"} value={@val}
      class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500" />
    """
  end

  # ── Helpers ────────────────────────────────────────────────────

  defp humanize(col) do
    col
    |> String.replace("_json", "")
    |> String.replace("_id", "")
    |> String.replace("_", " ")
    |> String.split(" ")
    |> Enum.map(&String.capitalize/1)
    |> Enum.join(" ")
  end

  defp smart_col_class(col) do
    case SmartFields.smart_type(col) do
      {:rule_builder, _} -> "flex flex-col gap-1 md:col-span-2"
      :textarea -> "flex flex-col gap-1 md:col-span-2"
      _ -> "flex flex-col gap-1"
    end
  end

  defp put_assign(assigns, key, value) do
    Map.put(assigns, key, value)
  end
end
