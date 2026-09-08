defmodule TePhoenix.AI.Jarvis do
  @moduledoc """
  Backwards-compatibility delegate pointing to `TePhoenix.AI.Uile` (Omni).
  """

  defdelegate chat(messages, opts \\ []), to: TePhoenix.AI.Uile
  defdelegate extract_plan(text), to: TePhoenix.AI.Uile
end
