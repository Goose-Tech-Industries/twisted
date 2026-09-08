defmodule TePhoenix.AI.JarvisOperations do
  @moduledoc """
  Backwards-compatibility delegate pointing to `TePhoenix.AI.UileOperations` (Omni).
  """

  defdelegate ensure_schema, to: TePhoenix.AI.UileOperations
  defdelegate execute_plan(plan), to: TePhoenix.AI.UileOperations
  defdelegate execute_action(action), to: TePhoenix.AI.UileOperations
end
