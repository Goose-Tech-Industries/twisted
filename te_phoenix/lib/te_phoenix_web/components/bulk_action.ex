defmodule TePhoenixWeb.Components.BulkAction do
  @moduledoc """
  Tier α P5 — multi-select + floating action bar pattern for any list
  view. Renders:

    1. A master-checkbox column header (`bulk_master_checkbox/1`)
    2. A per-row checkbox cell (`bulk_row_checkbox/1`)
    3. A floating action bar (`bulk_action_bar/1`) that appears at the
       bottom when ≥1 row is selected.

  Selection state lives in the parent LV under the `:bulk_selected`
  assign as a MapSet of item ids. The host wires a single
  `handle_event("bulk_action:*", ...)` clause that delegates here.

  ## Usage from a LiveView

      # mount/3
      socket = assign(socket, :bulk_selected, MapSet.new())

      # render/1 — header
      <thead><tr>
        <th><.bulk_master_checkbox items={@items} selected={@bulk_selected} /></th>
        <th>Name</th> ...
      </tr></thead>

      # render/1 — per row
      <tr :for={item <- @items}>
        <td><.bulk_row_checkbox id={item.id} selected={@bulk_selected} /></td>
        <td>{item.name}</td> ...
      </tr>

      # render/1 — bar (anywhere; positions itself)
      <.bulk_action_bar
        selected={@bulk_selected}
        actions={[
          %{key: "delete", label: "Delete", kind: :destructive,
            confirm_phrase: "BULK DELETE"},
          %{key: "export", label: "Export JSON", kind: :reversible},
          %{key: "clone", label: "Clone", kind: :reversible}
        ]} />

      # handle_event/3
      def handle_event("bulk_action:" <> _ = ev, params, socket),
        do: BulkAction.handle_event(ev, params, socket)

  Param-taking actions (those declaring `:params`) open a small inline
  prompt before firing. Destructive actions are wrapped in a
  ConfirmAction modal automatically.
  """

  use Phoenix.Component
  alias Phoenix.LiveView.JS
  alias TePhoenixWeb.Components.ConfirmAction

  # ── Master checkbox ──────────────────────────────────────────────

  attr :items, :list, required: true
  attr :selected, MapSet, required: true

  def bulk_master_checkbox(assigns) do
    all_selected =
      Enum.all?(assigns.items, fn it -> MapSet.member?(assigns.selected, it_id(it)) end)

    assigns = assign(assigns, :all_selected, all_selected and assigns.items != [])

    ~H"""
    <input
      type="checkbox"
      checked={@all_selected}
      phx-click="bulk_action:toggle_all"
      class="accent-amber-500 cursor-pointer"
      title={if @all_selected, do: "Deselect all", else: "Select all"} />
    """
  end

  # ── Per-row checkbox ─────────────────────────────────────────────

  attr :id, :any, required: true
  attr :selected, MapSet, required: true

  def bulk_row_checkbox(assigns) do
    checked = MapSet.member?(assigns.selected, to_id(assigns.id))
    assigns = assign(assigns, :checked, checked)

    ~H"""
    <input
      type="checkbox"
      checked={@checked}
      phx-click="bulk_action:toggle_row"
      phx-value-id={@id}
      class="accent-amber-500 cursor-pointer" />
    """
  end

  # ── Floating action bar ──────────────────────────────────────────

  attr :selected, MapSet, required: true
  attr :actions, :list, required: true,
       doc: "List of %{key, label, kind, [confirm_phrase, params]}"

  def bulk_action_bar(assigns) do
    count = MapSet.size(assigns.selected)
    assigns = assign(assigns, :count, count)

    ~H"""
    <div :if={@count > 0}
      class="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-zinc-900 border border-amber-600 rounded-lg shadow-2xl px-4 py-2 flex items-center gap-3">
      <span class="text-xs font-bold text-amber-400">{@count} selected</span>
      <div class="h-4 w-px bg-zinc-700"></div>

      <%= for action <- @actions do %>
        <%= cond do %>
          <% action.kind == :destructive and Map.get(action, :confirm_phrase) -> %>
            <.bulk_destructive_action action={action} count={@count} />
          <% Map.get(action, :params) -> %>
            <.bulk_param_action action={action} />
          <% true -> %>
            <button
              type="button"
              phx-click="bulk_action:fire"
              phx-value-key={action.key}
              class={["px-2 py-1 text-xs rounded transition-colors", action_class(action.kind)]}>
              {action.label}
            </button>
        <% end %>
      <% end %>

      <div class="h-4 w-px bg-zinc-700"></div>
      <button type="button" phx-click="bulk_action:clear"
        class="text-xs text-zinc-400 hover:text-zinc-200">Clear</button>
    </div>
    """
  end

  attr :action, :map, required: true
  attr :count, :integer, required: true

  defp bulk_destructive_action(assigns) do
    ~H"""
    <ConfirmAction.confirm_action
      id={"bulk-#{@action.key}"}
      kind={:destructive}
      title={"#{@action.label} (#{@count} items)"}
      message={"This will #{String.downcase(@action.label)} all #{@count} selected items. Cannot be undone."}
      confirm_label={@action.label}
      confirm_phrase={@action.confirm_phrase}
      on_confirm={JS.push("bulk_action:fire", value: %{key: @action.key})}>
      <:trigger>
        <button type="button"
          class="px-2 py-1 text-xs rounded bg-rose-700 hover:bg-rose-600 text-white">
          {@action.label}
        </button>
      </:trigger>
    </ConfirmAction.confirm_action>
    """
  end

  attr :action, :map, required: true

  defp bulk_param_action(assigns) do
    ~H"""
    <details class="relative">
      <summary class={[
        "px-2 py-1 text-xs rounded cursor-pointer transition-colors list-none",
        action_class(@action.kind)
      ]}>
        {@action.label} ▾
      </summary>
      <form phx-submit="bulk_action:fire"
        class="absolute bottom-full mb-1 left-0 bg-zinc-900 border border-zinc-700 rounded p-2 flex flex-col gap-1.5 min-w-[200px]">
        <input type="hidden" name="key" value={@action.key} />
        <%= for param <- @action.params do %>
          <label class="text-[10px] text-zinc-500 flex flex-col gap-0.5">
            <span>{param.label || param.key}</span>
            <input
              type={input_type(param.type)}
              name={"params[#{param.key}]"}
              placeholder={Map.get(param, :placeholder, "")}
              class="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />
          </label>
        <% end %>
        <button type="submit"
          class="px-2 py-1 text-xs bg-amber-700 hover:bg-amber-600 text-black font-bold rounded">
          {@action.label}
        </button>
      </form>
    </details>
    """
  end

  defp action_class(:destructive), do: "bg-rose-700 hover:bg-rose-600 text-white"
  defp action_class(:reversible), do: "bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700"
  defp action_class(_), do: "bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700"

  defp input_type(:integer), do: "number"
  defp input_type(:float), do: "number"
  defp input_type(_), do: "text"

  defp it_id(%{id: id}), do: to_id(id)
  defp it_id(%{"id" => id}), do: to_id(id)
  defp it_id(other), do: to_id(other)

  defp to_id(id) when is_integer(id), do: id
  defp to_id(id) when is_binary(id), do: id
  defp to_id(other), do: to_string(other)

  # ── handle_event helper ──────────────────────────────────────────

  @doc """
  Default `handle_event/3` for the bulk_action:* events. Mutates
  `:bulk_selected` and re-emits `bulk_action:on_fire` with the chosen
  action key + selection MapSet so the host LV's domain handler can
  do the actual work.

  Hosts must implement `handle_event("bulk_action:on_fire", %{key, ids}, socket)`
  to perform the per-domain side effect (delete rows, export JSON, etc.).
  """
  def handle_event("bulk_action:toggle_all", _params, socket) do
    items = socket.assigns[:items] || socket.assigns[:rows] || []
    current = socket.assigns[:bulk_selected] || MapSet.new()

    all_ids = MapSet.new(items, fn it -> it_id(it) end)

    new_set =
      if MapSet.equal?(current, all_ids) do
        MapSet.new()
      else
        all_ids
      end

    {:noreply, Phoenix.Component.assign(socket, :bulk_selected, new_set)}
  end

  def handle_event("bulk_action:toggle_row", %{"id" => id}, socket) do
    current = socket.assigns[:bulk_selected] || MapSet.new()
    id = to_id(id)

    new_set =
      if MapSet.member?(current, id),
        do: MapSet.delete(current, id),
        else: MapSet.put(current, id)

    {:noreply, Phoenix.Component.assign(socket, :bulk_selected, new_set)}
  end

  def handle_event("bulk_action:clear", _params, socket),
    do: {:noreply, Phoenix.Component.assign(socket, :bulk_selected, MapSet.new())}

  def handle_event("bulk_action:fire", params, socket) do
    selected = socket.assigns[:bulk_selected] || MapSet.new()
    key = params["key"]
    extras = Map.drop(params, ["key"])

    # Re-dispatch as a domain event so the host LV can hook in.
    msg =
      params
      |> Map.put("ids", MapSet.to_list(selected))
      |> Map.put("key", key)
      |> Map.merge(extras)

    send(self(), {:bulk_action_fired, msg})
    {:noreply, socket}
  end

  def handle_event(_other, _params, socket), do: {:noreply, socket}
end
