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

    quote do
      import TePhoenixWeb.Admin.CrudHelpers
      import TePhoenixWeb.Admin.HubCrudComponents

      @per_page unquote(per_page)
      @tab_config unquote(tab_config)
      @hub_title unquote(hub_title)

      @impl true
      def mount(_params, _session, socket) do
        {_l, first} = hd(@tab_config)
        {:ok, socket
         |> assign(active_tab: unquote(active_tab), tab: first, tab_config: @tab_config,
            hub_title: @hub_title, per_page: @per_page, search: "", page: 1, rows: [],
            columns: [], column_types: %{}, total: 0, current_table: first,
            editing: nil, creating: false, form_data: %{}, form_errors: [])
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
end
