defmodule TePhoenixWeb.Admin.CapabilitiesLive do
  @moduledoc """
  Capability management panel — `/sauce/capabilities`.

  Lists every registered capability module. For each one, shows:

    * Name + version + description + group
    * Per-module on/off toggle (persisted via `Capabilities.set_enabled/2`)
    * Dependency warnings: any required capability that's currently off
    * Sidebar panels the module owns
    * DB tables the module reads/writes
    * Provided features (atoms in `:provides`)

  Toggling a capability flips it immediately. Re-validation runs on every
  toggle so dependency warnings are live.

  Why this exists separate from the onboarding wizard: onboarding is a
  one-shot genre seeder. This panel is for ongoing tuning — a designer
  who wants to add `:dialogue` mid-project shouldn't have to re-run
  onboarding to do it.
  """
  use TePhoenixWeb, :live_view

  alias TePhoenix.Capabilities

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(:active_tab, :system)
     |> assign(:page_title, "Capabilities")
     |> load_state()}
  end

  defp load_state(socket) do
    modules = Capabilities.list_modules()
    enabled = Capabilities.Registry.all()
    issues = case Capabilities.validate() do
      {:ok, _} -> []
      {:error, list} -> list
    end

    socket
    |> assign(:modules, modules)
    |> assign(:enabled, enabled)
    |> assign(:dependency_issues, issues)
    |> assign(:load_order, Capabilities.load_order())
    |> assign_new(:pending_disable, fn -> nil end)
    |> assign_new(:pending_dependents, fn -> [] end)
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="p-6 max-w-5xl mx-auto">
      <header class="mb-6">
        <h1 class="text-xl font-bold text-amber-400">Capabilities</h1>
        <p class="text-xs text-zinc-500 mt-1">
          Engine systems are independently toggleable. Disabled modules hide their AdminSauce panels and skip their runtimes.
        </p>
      </header>

      <div :if={@pending_disable} class="mb-4 p-4 bg-amber-950/40 border border-amber-700 rounded text-xs">
        <div class="font-bold text-amber-300 mb-2">
          ⚠ Disabling <strong>{@pending_disable}</strong> will break {length(@pending_dependents)} dependent module(s):
        </div>
        <ul class="text-amber-200 space-y-0.5 ml-4 mb-3">
          <li :for={id <- @pending_dependents}>• {id}</li>
        </ul>
        <div class="flex gap-2">
          <button phx-click="toggle" phx-value-id={@pending_disable}
            class="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white font-bold rounded text-xs">
            Disable {@pending_disable} + cascade
          </button>
          <button phx-click="cancel_disable"
            class="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs">
            Cancel
          </button>
        </div>
      </div>

      <div :if={@dependency_issues != []} class="mb-4 p-3 bg-red-950/40 border border-red-800 rounded text-xs">
        <div class="font-bold text-red-400 mb-1">Unmet dependencies</div>
        <ul class="space-y-0.5 text-red-300">
          <li :for={{id, missing} <- @dependency_issues}>
            <strong>{id}</strong> requires: {Enum.join(missing, ", ")}
          </li>
        </ul>
      </div>

      <div :if={@load_order != []} class="mb-4 p-3 bg-zinc-900/60 border border-zinc-800 rounded text-[10px] font-mono text-zinc-500">
        Load order: {Enum.join(@load_order, " → ")}
      </div>

      <div class="space-y-3">
        <div :for={mod <- @modules}
          class={["bg-zinc-900 border rounded p-4",
            Map.get(@enabled, mod.id, false) && "border-emerald-800/50",
            !Map.get(@enabled, mod.id, false) && "border-zinc-800"]}>
          <div class="flex items-start gap-4">
            <button phx-click="toggle" phx-value-id={mod.id}
              class={["w-12 h-6 rounded-full relative transition-colors shrink-0 mt-1",
                Map.get(@enabled, mod.id, false) && "bg-emerald-600",
                !Map.get(@enabled, mod.id, false) && "bg-zinc-700"]}>
              <span class={["absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                Map.get(@enabled, mod.id, false) && "left-6",
                !Map.get(@enabled, mod.id, false) && "left-0.5"]}>
              </span>
            </button>

            <div class="flex-1">
              <div class="flex items-center gap-2">
                <h3 class="text-sm font-bold text-amber-300">{mod.name}</h3>
                <span class="text-[10px] text-zinc-500">v{mod.version}</span>
                <span class="text-[10px] px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400">{mod.id}</span>
              </div>
              <p class="text-xs text-zinc-400 mt-1">{mod.description}</p>

              <div class="mt-2 grid grid-cols-3 gap-3 text-[10px] text-zinc-500">
                <div :if={mod.provides && mod.provides != []}>
                  <span class="text-zinc-600 uppercase">Provides</span>
                  <div class="text-zinc-400">{Enum.map_join(mod.provides, ", ", &to_string/1)}</div>
                </div>
                <div :if={Map.get(mod, :requires, []) != []}>
                  <span class="text-zinc-600 uppercase">Requires</span>
                  <div class="text-amber-400">{Enum.map_join(mod[:requires] || [], ", ", &to_string/1)}</div>
                </div>
                <div :if={Map.get(mod, :db_tables, []) != []}>
                  <span class="text-zinc-600 uppercase">Tables</span>
                  <div class="text-zinc-400 font-mono">{Enum.join(mod[:db_tables] || [], ", ")}</div>
                </div>
                <div :if={Map.get(mod, :ui_panels, []) != []}>
                  <span class="text-zinc-600 uppercase">UI Panels</span>
                  <div class="text-zinc-400">{Enum.map_join(mod[:ui_panels] || [], ", ", &to_string/1)}</div>
                </div>
                <div :if={mod.genres && mod.genres != []}>
                  <span class="text-zinc-600 uppercase">Genres</span>
                  <div class="text-zinc-400">{Enum.map_join(mod.genres, ", ", &to_string/1)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    """
  end

  @impl true
  def handle_event("toggle", %{"id" => id}, socket) do
    atom_id = String.to_existing_atom(id)
    current = Capabilities.enabled?(atom_id)

    if current do
      # Disable path — check for reverse dependencies. If any enabled
      # module depends on this one, warn the user and block the toggle
      # unless they've already confirmed.
      dependents =
        Capabilities.list_modules()
        |> Enum.filter(fn m ->
          Capabilities.enabled?(m.id) and atom_id in (m[:requires] || [])
        end)
        |> Enum.map(& &1.id)

      cond do
        dependents == [] ->
          Capabilities.set_enabled(atom_id, false)
          {:noreply, load_state(socket)}

        socket.assigns[:pending_disable] == atom_id ->
          # User confirmed — cascade-disable everything that depended on it
          Enum.each([atom_id | dependents], &Capabilities.set_enabled(&1, false))

          {:noreply,
           socket
           |> assign(:pending_disable, nil)
           |> load_state()}

        true ->
          {:noreply,
           socket
           |> assign(:pending_disable, atom_id)
           |> assign(:pending_dependents, dependents)}
      end
    else
      Capabilities.set_enabled(atom_id, true)
      {:noreply, load_state(socket)}
    end
  end

  def handle_event("cancel_disable", _params, socket) do
    {:noreply, socket |> assign(:pending_disable, nil) |> assign(:pending_dependents, [])}
  end
end
