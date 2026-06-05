ExUnit.start()

# DDL is non-transactional in MySQL — running CREATE TABLE inside a
# sandbox-wrapped test commits the transaction. Set up the test schema
# once at boot, before the sandbox starts owning connections.
{:ok, _} = Application.ensure_all_started(:te_phoenix)

if function_exported?(TePhoenix.DataCase, :ensure_map_ops_schema!, 0) do
  Ecto.Adapters.SQL.Sandbox.checkout(TePhoenix.Repo, sandbox: false)
  TePhoenix.DataCase.ensure_map_ops_schema!()

  for fun <- [
        :ensure_quests_schema!,
        :ensure_crafting_schema!,
        :ensure_achievements_schema!,
        :ensure_magic_schema!,
        :ensure_fog_schema!
      ] do
    if function_exported?(TePhoenix.DataCase, fun, 0) do
      apply(TePhoenix.DataCase, fun, [])
    end
  end

  # Pre-warm runtime modules' persistent_term schema caches. Their
  # ensure_schema/0 runs ALTER TABLE on first call, which commits the
  # surrounding transaction — fatal when the surrounding transaction
  # is the per-test sandbox. Calling them here (still inside the
  # non-sandbox checkout) drains all DDL up front; the cache then makes
  # every in-test call a no-op :ets read.
  for {mod, fun} <- [
        {TePhoenix.Game.Achievements, :ensure_schema},
        {TePhoenix.Game.Magic, :ensure_schema},
        {TePhoenix.Game.Fog, :ensure_schema}
      ] do
    if Code.ensure_loaded?(mod) and function_exported?(mod, fun, 0) do
      apply(mod, fun, [])
    end
  end

  Ecto.Adapters.SQL.Sandbox.checkin(TePhoenix.Repo)
end

# Enable capabilities the runtime modules gate on. set_enabled/2
# routes through the Capabilities.Registry GenServer which both
# updates its in-process cache and persists to game_capability_state.
# Done outside the sandbox so the row commits and stays visible to
# every test connection.
if Code.ensure_loaded?(TePhoenix.Capabilities) and
     function_exported?(TePhoenix.Capabilities, :set_enabled, 2) do
  for cap <- [:magic, :fog_of_war, :crafting] do
    try do
      TePhoenix.Capabilities.set_enabled(cap, true)
    catch
      _, _ -> :ok
    end
  end
end

Ecto.Adapters.SQL.Sandbox.mode(TePhoenix.Repo, :manual)
