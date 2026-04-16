defmodule TePhoenixWeb.Admin.OnboardingLive do
  @moduledoc """
  Onboarding wizard — "What kind of game do you want to build?"

  Three steps:

    1. **Genre pick** — visual tiles for RPG, RTS, Roguelike, Visual Novel,
       Tower Defense, Deckbuilder, Hybrid (mix manually), Decide Later.
    2. **Confirm** — shows which capability modules will be enabled and
       what the seeded starter content will look like.
    3. **Launch** — flips capabilities, writes the seed, and redirects to
       AdminSauce dashboard with a "ship your first thing" guide tailored
       to the chosen genre.

  Genre is switchable mid-project via this same wizard — re-running it
  toggles modules but never wipes content. Existing maps, NPCs, items,
  etc. stay intact; only the AdminSauce sidebar visibility and module
  default behaviours change.

  Route: `/sauce/onboarding`.
  """
  use TePhoenixWeb, :live_view

  alias TePhoenix.Capabilities
  alias TePhoenix.Game.OnboardingSeeder

  @genres [
    %{
      key: :rpg,
      label: "Classic RPG",
      icon: "⚔️",
      tagline: "Party-based exploration, towns, dungeons, story.",
      ship_first: "A 5-room dungeon with one boss, one shop, and one quest."
    },
    %{
      key: :rts,
      label: "RTS",
      icon: "🏰",
      tagline: "Resource economies, base building, army control.",
      ship_first: "One starting base + two unit types + a 1v1 skirmish map."
    },
    %{
      key: :roguelike,
      label: "Roguelike",
      icon: "💀",
      tagline: "Procedural floors, permadeath, item synergies.",
      ship_first: "Procedural floor 1, three enemy types, perma-death loop."
    },
    %{
      key: :vn,
      label: "Visual Novel",
      icon: "📖",
      tagline: "Branching dialogue, characters, choice consequences.",
      ship_first: "Three-scene prologue with one branching choice."
    },
    %{
      key: :tower_defense,
      label: "Tower Defense",
      icon: "🗼",
      tagline: "Wave spawners, lane pathing, tower upgrades.",
      ship_first: "One lane, three wave types, two tower types."
    },
    %{
      key: :deckbuilder,
      label: "Deckbuilder",
      icon: "🃏",
      tagline: "Card collection, run-based progression, encounter nodes.",
      ship_first: "20-card starter deck + 3 encounter rooms."
    },
    %{
      key: :tactics,
      label: "Tactics",
      icon: "♟",
      tagline: "Grid combat, action points, terrain matters.",
      ship_first: "One battle map with 4 friendly + 4 enemy units."
    },
    %{
      key: :hybrid,
      label: "Hybrid",
      icon: "🎛",
      tagline: "Mix modules manually — full menu, no defaults.",
      ship_first: "Pick what you want. Nothing seeded by default."
    }
  ]

  @impl true
  def mount(_params, _session, socket) do
    state = Capabilities.Registry.all()

    {:ok,
     socket
     |> assign(:active_tab, :dashboard)
     |> assign(:page_title, "Onboarding — Twisted Engine")
     |> assign(:step, :pick)
     |> assign(:selected_genre, nil)
     |> assign(:current_state, state)
     |> assign(:seed_summary, nil)
     |> assign(:hybrid_selection, MapSet.new(for {id, on?} <- state, on?, do: id))}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="min-h-screen bg-zinc-950 text-zinc-200">
      <div class="max-w-5xl mx-auto px-6 py-10">
        <header class="text-center mb-10">
          <h1 class="text-3xl font-bold text-amber-400">Welcome to Twisted Engine</h1>
          <p class="text-zinc-500 mt-2 text-sm">
            What kind of game do you want to build? You can change this later — switching never deletes content.
          </p>
        </header>

        <%= case @step do %>
          <% :pick -> %>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
              <button :for={genre <- genres()}
                phx-click="select_genre" phx-value-key={genre.key}
                class={["text-left p-5 rounded-lg border-2 transition-all hover:scale-[1.02]",
                  @selected_genre == genre.key && "bg-amber-900/30 border-amber-500",
                  @selected_genre != genre.key && "bg-zinc-900 border-zinc-800 hover:border-zinc-600"]}>
                <div class="text-4xl mb-2">{genre.icon}</div>
                <div class="font-bold text-amber-300">{genre.label}</div>
                <p class="text-[11px] text-zinc-500 mt-1">{genre.tagline}</p>
              </button>
            </div>

            <div class="mt-8 flex justify-between items-center">
              <a href={~p"/sauce"} class="text-xs text-zinc-500 hover:text-zinc-300">
                ← Skip — I'll decide later
              </a>
              <button :if={@selected_genre} phx-click="next"
                class="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-black font-bold rounded-lg">
                Continue →
              </button>
            </div>

          <% :hybrid -> %>
            <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
              <h2 class="text-xl font-bold text-amber-300 mb-2">🎛 Hybrid — Build Your Own Stack</h2>
              <p class="text-xs text-zinc-500 mb-4">Pick exactly which capabilities you want. Dependency warnings appear in real time.</p>

              <div class="space-y-2">
                <label :for={mod <- Capabilities.list_modules()} class="flex items-start gap-3 p-2 hover:bg-zinc-800/50 rounded cursor-pointer">
                  <input type="checkbox"
                    phx-click="hybrid_toggle" phx-value-id={mod.id}
                    checked={MapSet.member?(@hybrid_selection, mod.id)} />
                  <div class="flex-1">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-bold text-amber-300">{mod.name}</span>
                      <span class="text-[10px] text-zinc-500">v{mod.version}</span>
                    </div>
                    <p class="text-[11px] text-zinc-500">{mod.description}</p>
                    <p :if={Map.get(mod, :requires, []) != []} class="text-[10px] text-amber-500 mt-0.5">
                      requires: {Enum.map_join(mod[:requires] || [], ", ", &to_string/1)}
                    </p>
                  </div>
                </label>
              </div>

              <div :for={{id, missing} <- hybrid_validate(@hybrid_selection)} class="mt-3 p-2 bg-red-950/40 border border-red-800 rounded text-[11px] text-red-300">
                ⚠ <strong>{id}</strong> needs: {Enum.join(missing, ", ")}
              </div>
            </div>

            <div class="mt-6 flex justify-between items-center">
              <button phx-click="back" class="text-xs text-zinc-500 hover:text-zinc-300">← Pick a different genre</button>
              <button phx-click="hybrid_apply"
                class="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-black font-bold rounded-lg">
                Apply Selection →
              </button>
            </div>

          <% :confirm -> %>
            <% genre = genre_by_key(@selected_genre) %>
            <% modules = Capabilities.list_for_genre(@selected_genre) %>
            <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
              <div class="flex items-center gap-4 mb-6">
                <div class="text-5xl">{genre.icon}</div>
                <div>
                  <h2 class="text-xl font-bold text-amber-300">{genre.label}</h2>
                  <p class="text-xs text-zinc-500">{genre.tagline}</p>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-6">
                <section>
                  <h3 class="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Modules to enable</h3>
                  <ul class="space-y-1 text-xs">
                    <li :for={mid <- modules} class="flex items-center gap-2 text-zinc-300">
                      <span class="text-emerald-500">✓</span>
                      {Map.get(Capabilities.get(mid) || %{}, :name, mid)}
                    </li>
                  </ul>
                </section>

                <section>
                  <h3 class="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Ship-your-first-thing</h3>
                  <p class="text-xs text-zinc-300 leading-relaxed">{genre.ship_first}</p>
                  <p class="text-[10px] text-zinc-600 mt-3">
                    The wizard will switch on the listed modules and leave everything else unchanged.
                    Your existing maps, NPCs, and items are preserved.
                  </p>
                </section>
              </div>
            </div>

            <div class="mt-6 flex justify-between items-center">
              <button phx-click="back" class="text-xs text-zinc-500 hover:text-zinc-300">← Pick a different genre</button>
              <button phx-click="apply"
                class="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-black font-bold rounded-lg">
                Apply &amp; Launch →
              </button>
            </div>

          <% :done -> %>
            <% genre = genre_by_key(@selected_genre) %>
            <div class="text-center bg-zinc-900 border border-zinc-800 rounded-lg p-10">
              <div class="text-6xl mb-4">{genre.icon}</div>
              <h2 class="text-2xl font-bold text-amber-300 mb-3">Setup complete!</h2>
              <p class="text-zinc-400 text-sm max-w-md mx-auto mb-4">
                Your AdminSauce sidebar now reflects {genre.label}.
              </p>

              <div :if={summary_items(@seed_summary) != []}
                class="max-w-md mx-auto bg-zinc-950 border border-zinc-800 rounded p-4 mb-6 text-left">
                <div class="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Seeded starter content</div>
                <ul class="text-xs text-zinc-300 space-y-1 font-mono">
                  <li :for={item <- summary_items(@seed_summary)} class="flex gap-2">
                    <span class="text-emerald-500">✓</span>
                    <span>{item}</span>
                  </li>
                </ul>
              </div>

              <p class="text-[11px] text-zinc-500 italic max-w-md mx-auto mb-6">
                Ship your first thing: {genre.ship_first}
              </p>

              <a href={~p"/sauce"}
                class="inline-block px-6 py-3 bg-amber-600 hover:bg-amber-500 text-black font-bold rounded-lg">
                Open AdminSauce →
              </a>
            </div>
        <% end %>
      </div>
    </div>
    """
  end

  @impl true
  def handle_event("select_genre", %{"key" => key}, socket) do
    {:noreply, assign(socket, :selected_genre, String.to_existing_atom(key))}
  end

  def handle_event("next", _params, socket) do
    next_step =
      case socket.assigns.selected_genre do
        :hybrid -> :hybrid
        _ -> :confirm
      end

    {:noreply, assign(socket, :step, next_step)}
  end

  def handle_event("hybrid_toggle", %{"id" => id}, socket) do
    atom_id = String.to_existing_atom(id)
    sel = socket.assigns.hybrid_selection

    new_sel =
      if MapSet.member?(sel, atom_id) do
        # Disabling → also disable anything that depends on this module.
        # Recursive reverse closure so a multi-level dep chain collapses.
        collect_reverse_deps(atom_id, sel)
        |> Enum.reduce(sel, &MapSet.delete(&2, &1))
        |> MapSet.delete(atom_id)
      else
        # Enabling → also enable this module's requires chain recursively
        # so the user never ends up with an invalid selection.
        collect_forward_deps(atom_id, sel)
        |> Enum.reduce(sel, &MapSet.put(&2, &1))
        |> MapSet.put(atom_id)
      end

    {:noreply, assign(socket, :hybrid_selection, new_sel)}
  end

  # All modules that (transitively) require `id`. Used when disabling.
  defp collect_reverse_deps(id, current_sel) do
    Enum.reduce(Capabilities.list_modules(), [], fn m, acc ->
      reqs = m[:requires] || []

      cond do
        id in reqs and MapSet.member?(current_sel, m.id) ->
          [m.id | collect_reverse_deps(m.id, current_sel)] ++ acc

        true ->
          acc
      end
    end)
    |> Enum.uniq()
  end

  # All modules that `id` (transitively) requires. Used when enabling.
  defp collect_forward_deps(id, _sel) do
    case Capabilities.get(id) do
      nil ->
        []

      %{} = mod ->
        direct = mod[:requires] || []
        transitive = Enum.flat_map(direct, &collect_forward_deps(&1, nil))
        Enum.uniq(direct ++ transitive)
    end
  end

  def handle_event("hybrid_apply", _params, socket) do
    sel = socket.assigns.hybrid_selection

    Enum.each(Capabilities.list_modules(), fn m ->
      Capabilities.set_enabled(m.id, MapSet.member?(sel, m.id))
    end)

    {:noreply, assign(socket, :step, :done)}
  end

  def handle_event("back", _params, socket) do
    {:noreply, assign(socket, :step, :pick)}
  end

  def handle_event("apply", _params, socket) do
    Capabilities.seed_genre(socket.assigns.selected_genre)
    seed_summary = OnboardingSeeder.seed(socket.assigns.selected_genre)

    {:noreply,
     socket
     |> assign(:step, :done)
     |> assign(:seed_summary, seed_summary)}
  end

  defp genres, do: @genres
  defp genre_by_key(key), do: Enum.find(@genres, &(&1.key == key))

  # Turn the OnboardingSeeder result into a flat list of human-readable
  # bullets. Handles both success summaries (%{map_id, npcs, ...}) and
  # idempotent-skip results (%{skipped: true, ...}).
  defp summary_items(nil), do: []
  defp summary_items({:ok, %{skipped: true}}), do: ["Already seeded — content reused"]

  defp summary_items({:ok, %{} = s}) do
    []
    |> then(&if(s[:map_id], do: &1 ++ ["Starter map created (id #{s[:map_id]})"], else: &1))
    |> then(&if(is_list(s[:npcs]), do: &1 ++ ["#{length(s[:npcs])} starter NPC(s)"], else: &1))
    |> then(&if(s[:item_id], do: &1 ++ ["Starter item (id #{s[:item_id]})"], else: &1))
    |> then(&if(s[:cards], do: &1 ++ ["#{s[:cards]} starter cards"], else: &1))
    |> then(&if(s[:script_id], do: &1 ++ ["Starter visual script (id #{s[:script_id]})"], else: &1))
    |> then(&if(s[:spawn_zone], do: &1 ++ ["Encounter spawn zone"], else: &1))
  end

  defp summary_items({:error, reason}), do: ["Seeding error: #{inspect(reason)}"]
  defp summary_items(_), do: []

  defp hybrid_validate(selection) do
    Capabilities.list_modules()
    |> Enum.filter(&MapSet.member?(selection, &1.id))
    |> Enum.flat_map(fn m ->
      missing = (m[:requires] || []) |> Enum.reject(&MapSet.member?(selection, &1))
      if missing == [], do: [], else: [{m.id, missing}]
    end)
  end
end
