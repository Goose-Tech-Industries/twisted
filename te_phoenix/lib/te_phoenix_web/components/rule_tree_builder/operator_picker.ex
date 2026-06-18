defmodule TePhoenixWeb.Components.RuleTreeBuilder.OperatorPicker do
  @moduledoc """
  Operator dropdown for a condition leaf. The set of operators offered
  is derived from the leaf field's declared `:type` in the domain
  schema (numeric → comparison ops; string/select → equality ops; etc.).
  """

  use Phoenix.Component

  @numeric_ops [
    {"==", "equals"},
    {"!=", "not equal"},
    {"<", "less than"},
    {"<=", "≤"},
    {">", "greater than"},
    {">=", "≥"}
  ]

  @equality_ops [
    {"==", "equals"},
    {"!=", "not equal"}
  ]

  @membership_ops [
    {"in", "is one of"},
    {"not_in", "is none of"},
    {"==", "equals"},
    {"!=", "not equal"}
  ]

  @doc """
  Returns operator options for a given field type.

  Field types in domain schemas:
    :integer, :float, :percent           → numeric_ops
    :string, :boolean                    → equality_ops
    :select_status, :select_surface, …   → membership_ops
  """
  def operators_for(:integer), do: @numeric_ops
  def operators_for(:float), do: @numeric_ops
  def operators_for(:percent), do: @numeric_ops
  def operators_for(:string), do: @equality_ops
  def operators_for(:boolean), do: @equality_ops
  def operators_for(type) when type in [:select_status, :select_surface, :select_npc, :select_map], do: @membership_ops
  def operators_for(_), do: @numeric_ops

  attr :name, :string, required: true,
       doc: "Form input name for this operator dropdown."
  attr :value, :string, default: "=="
  attr :field_type, :atom, default: :integer
  attr :phx_change, :string, default: nil
  attr :phx_value_id, :string, default: nil
  attr :phx_value_index, :integer, default: nil

  def operator_picker(assigns) do
    assigns = assign(assigns, :ops, operators_for(assigns.field_type))

    ~H"""
    <select
      name={@name}
      phx-change={@phx_change}
      phx-value-id={@phx_value_id}
      phx-value-index={@phx_value_index}
      class="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs">
      <option :for={{op, label} <- @ops} value={op} selected={@value == op}>
        {op} — {label}
      </option>
    </select>
    """
  end
end
