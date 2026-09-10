defmodule TePhoenixWeb.Components.RuleTreeBuilder.ConditionNode do
  @moduledoc """
  Renders one leaf condition row: field picker → operator → value
  input + remove button. The field picker is driven by the domain
  schema's `:conditions` list, each declaring `key`, `label`, `type`,
  optional `desc` for tooltip.
  """

  use Phoenix.Component
  alias TePhoenixWeb.Components.RuleTreeBuilder.{OperatorPicker, ValueInput}

  attr :id, :string, required: true,
       doc: "The parent rule_builder id — used for phx-value routing."
  attr :index, :integer, required: true
  attr :leaf, :map, required: true,
       doc: "%{field, operator, value, extras}"
  attr :schema, :map, required: true,
       doc: "Domain schema map with :conditions list."

  def render(assigns) do
    field_def = find_condition_def(assigns.schema, assigns.leaf.field)
    field_type = (field_def || %{})[:type] || :integer
    desc = (field_def || %{})[:desc]

    assigns =
      assigns
      |> assign(:field_def, field_def)
      |> assign(:field_type, field_type)
      |> assign(:desc, desc)

    ~H"""
    <div class="flex items-center gap-2 px-2 py-1.5 bg-zinc-900 border border-zinc-800 rounded">
      <span class="text-xs text-zinc-600 w-6">#{@index + 1}</span>

      <select
        name={"#{@id}[#{@index}][field]"}
        phx-change="rb:set_field"
        phx-value-id={@id}
        phx-value-index={@index}
        class="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs">
        <option value="">— pick —</option>
        <option
          :for={cond_def <- @schema.conditions}
          value={cond_def.key}
          selected={cond_def.key == @leaf.field}
          title={Map.get(cond_def, :desc, "")}>
          {cond_def.label}
        </option>
      </select>

      <OperatorPicker.operator_picker
        :if={@field_def}
        name={"#{@id}[#{@index}][operator]"}
        value={@leaf.operator}
        field_type={@field_type}
        phx_change="rb:set_op"
        phx_value_id={@id}
        phx_value_index={@index} />

      <ValueInput.value_input
        :if={@field_def}
        name={"#{@id}[#{@index}][value]"}
        value={@leaf.value}
        type={@field_type}
        options={Map.get(@field_def, :options)} />

      <span :if={@desc} class="text-xs text-zinc-500 italic ml-1">— {@desc}</span>

      <button
        type="button"
        phx-click="rb:remove"
        phx-value-id={@id}
        phx-value-kind="condition"
        phx-value-index={@index}
        class="ml-auto px-1.5 py-0.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded"
        title="Remove this condition">
        ✕
      </button>
    </div>
    """
  end

  defp find_condition_def(%{conditions: list}, field) when is_binary(field) and field != "" do
    Enum.find(list, &(&1.key == field))
  end

  defp find_condition_def(_, _), do: nil
end
