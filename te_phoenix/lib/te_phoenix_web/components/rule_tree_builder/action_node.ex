defmodule TePhoenixWeb.Components.RuleTreeBuilder.ActionNode do
  @moduledoc """
  Renders one action row: action-key picker → typed param inputs +
  remove button. Each action in the domain schema declares its
  `params: [%{key, type, ...}]`; we render one ValueInput per param.

  An action with no params renders just the picker (for boolean-style
  actions like `flee_combat: true`).
  """

  use Phoenix.Component
  alias TePhoenixWeb.Components.RuleTreeBuilder.ValueInput

  attr :id, :string, required: true
  attr :index, :integer, required: true
  attr :action, :map, required: true,
       doc: "%{key, params}"
  attr :schema, :map, required: true,
       doc: "Domain schema map with :actions list."

  def render(assigns) do
    action_def = find_action_def(assigns.schema, assigns.action.key)
    desc = (action_def || %{})[:desc]
    params_def = (action_def || %{})[:params] || []

    assigns =
      assigns
      |> assign(:action_def, action_def)
      |> assign(:params_def, params_def)
      |> assign(:desc, desc)

    ~H"""
    <div class="flex flex-wrap items-center gap-2 px-2 py-1.5 bg-zinc-900 border border-zinc-800 rounded">
      <span class="text-xs text-zinc-600 w-6">#{@index + 1}</span>

      <select
        name={"#{@id}[#{@index}][action]"}
        phx-change="rb:set_field"
        phx-value-id={@id}
        phx-value-index={@index}
        phx-value-kind="action"
        class="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs">
        <option value="">— pick action —</option>
        <option
          :for={a <- @schema.actions}
          value={a.key}
          selected={a.key == @action.key}
          title={Map.get(a, :desc, "")}>
          {a.label}
        </option>
      </select>

      <span :if={@action_def && Enum.any?(@params_def)} class="text-xs text-zinc-500">→</span>

      <div :for={p <- @params_def} class="flex items-center gap-1">
        <span class="text-xs text-zinc-500">{p.label || to_string(p.key)}:</span>
        <ValueInput.value_input
          name={"#{@id}[#{@index}][params][#{p.key}]"}
          value={Map.get(@action.params, to_string(p.key))}
          type={p.type}
          options={Map.get(p, :options)}
          placeholder={Map.get(p, :placeholder)}
          min={Map.get(p, :min)}
          max={Map.get(p, :max)} />
      </div>

      <span :if={@desc && Enum.empty?(@params_def)} class="text-xs text-zinc-500 italic ml-1">— {@desc}</span>

      <button
        type="button"
        phx-click="rb:remove"
        phx-value-id={@id}
        phx-value-kind="action"
        phx-value-index={@index}
        class="ml-auto px-1.5 py-0.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded"
        title="Remove this action">
        ✕
      </button>
    </div>
    """
  end

  defp find_action_def(%{actions: list}, key) when is_binary(key) and key != "" do
    Enum.find(list, &(&1.key == key))
  end

  defp find_action_def(_, _), do: nil
end
