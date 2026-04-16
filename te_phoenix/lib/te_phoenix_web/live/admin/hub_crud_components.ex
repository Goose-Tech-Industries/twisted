defmodule TePhoenixWeb.Admin.HubCrudComponents do
  @moduledoc "Shared HEEx components for all admin hub CRUD pages."
  use Phoenix.Component
  import TePhoenixWeb.Admin.CrudHelpers, only: [format_cell: 1, field_type: 2]

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
        <div class="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-2xl mb-12 shadow-2xl">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-bold text-amber-400">{@form_title} — {@tab_label}</h3>
            <button phx-click="cancel_form" class="text-zinc-500 hover:text-zinc-300 text-xl">&times;</button>
          </div>
          <div :for={err <- @form_errors} class="mb-3 p-2 bg-red-900/30 border border-red-700 rounded text-red-400 text-sm">{err}</div>
          <form phx-submit={if @creating, do: "save_new", else: "save_edit"} phx-change="update_form">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-2">
              <div :for={col <- @editable_cols} class="flex flex-col gap-1">
                <label class="text-xs font-bold text-zinc-500 uppercase tracking-wider">{col}</label>
                <.crud_field col={col} val={@form_data[col] || ""} ftype={field_type(@column_types, col)} />
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
                class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 whitespace-nowrap">{col}</th>
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

  # ── Field components ───────────────────────────────────────────
  def crud_field(%{ftype: :boolean} = assigns) do
    ~H"""
    <input type="checkbox" name={"entity[#{@col}]"} value="1" checked={@val in ["1", "true"]}
      class="rounded bg-zinc-800 border-zinc-600 text-amber-500 focus:ring-amber-500" />
    """
  end

  def crud_field(%{ftype: :textarea} = assigns) do
    ~H"""
    <textarea name={"entity[#{@col}]"} rows="3"
      class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none font-mono">{@val}</textarea>
    """
  end

  def crud_field(%{ftype: :number} = assigns) do
    ~H"""
    <input type="number" name={"entity[#{@col}]"} value={@val}
      class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
    """
  end

  def crud_field(assigns) do
    ~H"""
    <input type="text" name={"entity[#{@col}]"} value={@val}
      class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
    """
  end
end
