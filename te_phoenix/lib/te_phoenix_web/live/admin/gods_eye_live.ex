defmodule TePhoenixWeb.Admin.GodsEyeLive do
  use TePhoenixWeb, :live_view

  alias TePhoenix.World.{GodsEye, AutonomousSociety}
  alias TePhoenix.AI.DreamCycle

  @impl true
  def mount(_params, _session, socket) do
    if connected?(socket) do
      # Refresh radar every 5 seconds
      :timer.send_interval(5000, self(), :refresh_radar)
    end

    scan_data = GodsEye.scan_realm()
    society_events = AutonomousSociety.recent_events()

    socket =
      socket
      |> assign(:page_title, "God's Eye — Tactical Sonar Matrix")
      |> assign(:radar, scan_data)
      |> assign(:selected_entity, nil)
      |> assign(:wiretap_data, nil)
      |> assign(:society_events, society_events)
      |> assign(:whisper_input, "")
      |> assign(:active_tab, :gods_eye)

    {:ok, socket}
  end

  @impl true
  def handle_info(:refresh_radar, socket) do
    scan_data = GodsEye.scan_realm()
    society_events = AutonomousSociety.recent_events()

    {:noreply,
     socket
     |> assign(:radar, scan_data)
     |> assign(:society_events, society_events)}
  end

  @impl true
  def handle_event("select_entity", %{"type" => type, "id" => id}, socket) do
    case GodsEye.wiretap_entity(type, id) do
      {:ok, wiretap} ->
        {:noreply,
         socket
         |> assign(:selected_entity, %{type: type, id: id})
         |> assign(:wiretap_data, wiretap)
         |> push_event("sonar_ping", %{})}

      _ ->
        {:noreply, put_flash(socket, :error, "Entity signal lost in the Aether.")}
    end
  end

  @impl true
  def handle_event("orbital_strike", %{"map_id" => map_id, "x" => x, "y" => y}, socket) do
    res = GodsEye.orbital_strike(map_id, x, y, damage: 750)
    {:noreply,
     socket
     |> put_flash(:info, res.detail)
     |> push_event("strike_dispatched", %{})}
  end

  @impl true
  def handle_event("orbital_supply_drop", %{"map_id" => map_id, "x" => x, "y" => y}, socket) do
    res = GodsEye.orbital_supply_drop(map_id, x, y)
    {:noreply,
     socket
     |> put_flash(:info, res.detail)
     |> push_event("sonar_ping", %{})}
  end

  @impl true
  def handle_event("send_whisper", %{"message" => message}, socket) do
    case socket.assigns.wiretap_data do
      %{type: :player, id: char_id} ->
        res = GodsEye.orbital_whisper(char_id, message)
        {:noreply, put_flash(socket, :info, "Whisper transmitted: \"#{res.message}\"")}

      _ ->
        {:noreply, put_flash(socket, :error, "Select an active player to whisper.")}
    end
  end

  @impl true
  def handle_event("trigger_dream_cycle", _params, socket) do
    {:ok, receipts} = DreamCycle.process_night_cycle()
    {:noreply, put_flash(socket, :info, "🌙 Nightly Dream Cycle executed across #{length(receipts)} entities!")}
  end

  @impl true
  def handle_event("trigger_society_tick", _params, socket) do
    {:ok, event} = AutonomousSociety.tick()
    events = [event | socket.assigns.society_events]
    {:noreply, socket |> assign(:society_events, events) |> put_flash(:info, "Emergent event: #{event.text}")}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div id="gods-eye-container" phx-hook="GodsEyeSonar" class="h-[calc(100vh-5rem)] flex flex-col bg-stone-950 text-stone-100 font-sans">
      <!-- Header HUD -->
      <div class="border-b border-cyan-900/60 bg-stone-900/90 px-6 py-3 flex items-center justify-between backdrop-blur">
        <div class="flex items-center space-x-3">
          <div class="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-600 via-sky-700 to-indigo-900 flex items-center justify-center text-xl shadow-lg shadow-cyan-950/80 animate-pulse">
            👁️
          </div>
          <div>
            <h1 class="text-lg font-bold tracking-wider text-cyan-400 font-mono flex items-center space-x-2">
              <span>GOD'S EYE // AN TSÚIL UILE</span>
              <span class="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 tracking-widest uppercase">
                ACTIVE RADAR
              </span>
            </h1>
            <p class="text-xs text-stone-400 font-mono">
              Universal Sonar Matrix • Soul Wiretap • Ramsey Threat Scanner • Orbital Reality Warping
            </p>
          </div>
        </div>

        <div class="flex items-center space-x-4 text-xs font-mono">
          <span class="text-stone-400">Tracked Entities: <strong class="text-cyan-400"><%= @radar.total_tracked %></strong></span>
          <button phx-click="trigger_dream_cycle" class="px-3 py-1.5 rounded bg-indigo-950 border border-indigo-700 text-indigo-300 hover:bg-indigo-900 transition">
            🌙 Trigger Dream Cycle
          </button>
          <button phx-click="trigger_society_tick" class="px-3 py-1.5 rounded bg-emerald-950 border border-emerald-700 text-emerald-300 hover:bg-emerald-900 transition">
            🌱 Society Pulse
          </button>
          <a href="/sauce/uile" class="text-stone-400 hover:text-stone-200 underline">Uile Architect</a>
        </div>
      </div>

      <!-- Main Radar & Wiretap Grid -->
      <div class="flex-1 flex overflow-hidden">
        <!-- Center/Left: Tactical Sonar Map -->
        <div class="flex-1 flex flex-col border-r border-stone-800 bg-stone-950/95 relative p-6 overflow-y-auto">
          <!-- Sonar Sweep Grid Effect -->
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-xs font-mono uppercase text-cyan-500 tracking-widest font-bold flex items-center space-x-2">
              <span class="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
              <span>Tactical Grid Viewport</span>
            </h2>
            <div class="flex items-center space-x-4 text-[11px] font-mono text-stone-400">
              <span class="flex items-center space-x-1.5"><span class="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span><span>Player</span></span>
              <span class="flex items-center space-x-1.5"><span class="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span><span>NPC</span></span>
              <span class="flex items-center space-x-1.5"><span class="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span><span>Enemy/Boss</span></span>
            </div>
          </div>

          <!-- Tactical Map Radar Canvas Container -->
          <div class="flex-1 min-h-[420px] rounded-xl border border-cyan-900/50 bg-stone-900/40 relative overflow-hidden p-4 shadow-inner flex flex-col">
            <!-- Background Matrix Lines -->
            <div class="absolute inset-0 bg-[linear-gradient(to_right,#164e6315_1px,transparent_1px),linear-gradient(to_bottom,#164e6315_1px,transparent_1px)] bg-[size:32px_32px]"></div>

            <!-- Entities Radar Grid -->
            <div class="relative flex-1">
              <%= for ent <- @radar.players ++ @radar.npcs do %>
                <%
                  color =
                    case ent.type do
                      :player -> "bg-emerald-500 text-emerald-300 border-emerald-400 shadow-emerald-900/80"
                      :enemy -> "bg-rose-500 text-rose-300 border-rose-400 shadow-rose-900/80"
                      _ -> "bg-amber-500 text-amber-300 border-amber-400 shadow-amber-900/80"
                    end

                  left_pct = min(92, max(4, ent.x * 3))
                  top_pct = min(90, max(4, ent.y * 3))
                %>
                <button
                  phx-click="select_entity"
                  phx-value-type={to_string(ent.type)}
                  phx-value-id={ent.id}
                  style={"position: absolute; left: #{left_pct}%; top: #{top_pct}%;"}
                  class={"group -translate-x-1/2 -translate-y-1/2 flex items-center space-x-1 focus:outline-none transition-transform hover:scale-125 z-10"}
                >
                  <div class={"w-4 h-4 rounded-full border shadow-lg flex items-center justify-center text-[9px] font-bold #{color}"}>
                    <%= if ent.type == :player, do: "P", else: if(ent.type == :enemy, do: "!", else: "N") %>
                  </div>
                  <span class="text-[10px] font-mono bg-stone-950/80 px-1.5 py-0.5 rounded border border-stone-800 text-stone-300 whitespace-nowrap opacity-80 group-hover:opacity-100">
                    <%= ent.name %>
                  </span>
                </button>
              <% end %>
            </div>
          </div>

          <!-- Bottom: Autonomous Society Feed -->
          <div class="mt-4 border-t border-stone-800 pt-4">
            <h3 class="text-xs font-mono uppercase text-stone-400 tracking-wider font-bold mb-2">
              Emergent Society Wiretap (Autonomous Loop)
            </h3>
            <div class="space-y-1.5 max-h-32 overflow-y-auto pr-2 text-xs font-mono">
              <%= for evt <- @society_events do %>
                <div class="bg-stone-900/80 border border-stone-800/60 p-2 rounded flex items-start space-x-2 text-stone-300">
                  <span class="text-cyan-400 font-bold">⚡</span>
                  <p class="flex-1 leading-snug"><%= evt.text %></p>
                  <span class="text-[10px] text-stone-500 capitalize"><%= evt.category %></span>
                </div>
              <% end %>
            </div>
          </div>
        </div>

        <!-- Right: The Soul Wiretap & Orbital Command Terminal -->
        <div class="w-[440px] bg-stone-900/60 p-6 flex flex-col overflow-y-auto space-y-6 border-l border-stone-800">
          <%= if @wiretap_data do %>
            <!-- Target Dossier Card -->
            <div class="rounded-xl bg-stone-950 border border-cyan-500/50 p-5 shadow-2xl relative">
              <div class="flex items-center justify-between mb-3">
                <span class="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800">
                  Signal Locked: <%= @wiretap_data.type %>
                </span>
                <span class="text-xs font-mono text-stone-400">Coords: <%= inspect(@wiretap_data.coords) %></span>
              </div>

              <h2 class="text-lg font-bold text-stone-100 font-mono"><%= @wiretap_data.name %></h2>
              <p class="text-xs text-stone-400 mb-4">
                <%= if @wiretap_data[:role], do: "Role: #{@wiretap_data.role} | ", else: "" %>
                <%= if @wiretap_data[:faction], do: "Faction: #{@wiretap_data.faction}", else: "" %>
              </p>

              <!-- Soul Psychological Wiretap (if NPC with SSE soul) -->
              <%= if @wiretap_data[:soul] do %>
                <div class="bg-stone-900/90 border border-stone-800 p-3.5 rounded-lg mb-4 space-y-2 text-xs font-mono">
                  <h4 class="text-[11px] text-cyan-400 font-bold uppercase tracking-wider">Subconscious Telemetry</h4>
                  
                  <!-- Emotional Bars -->
                  <%= if emotions = @wiretap_data.soul["emotional_state"] do %>
                    <div class="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span class="text-stone-400">Confidence: <%= emotions["confidence"] %>%</span>
                        <div class="w-full bg-stone-800 h-1.5 rounded overflow-hidden mt-0.5">
                          <div class="bg-emerald-500 h-full" style={"width: #{emotions["confidence"]}%"}></div>
                        </div>
                      </div>
                      <div>
                        <span class="text-stone-400">Stress: <%= emotions["stress"] %>%</span>
                        <div class="w-full bg-stone-800 h-1.5 rounded overflow-hidden mt-0.5">
                          <div class="bg-amber-500 h-full" style={"width: #{emotions["stress"]}%"}></div>
                        </div>
                      </div>
                      <div>
                        <span class="text-stone-400">Anger: <%= emotions["anger"] %>%</span>
                        <div class="w-full bg-stone-800 h-1.5 rounded overflow-hidden mt-0.5">
                          <div class="bg-rose-500 h-full" style={"width: #{emotions["anger"]}%"}></div>
                        </div>
                      </div>
                      <div>
                        <span class="text-stone-400">Gratitude: <%= emotions["gratitude"] %>%</span>
                        <div class="w-full bg-stone-800 h-1.5 rounded overflow-hidden mt-0.5">
                          <div class="bg-indigo-500 h-full" style={"width: #{emotions["gratitude"]}%"}></div>
                        </div>
                      </div>
                    </div>
                  <% end %>

                  <%= if profile = @wiretap_data.soul["soul_profile"] do %>
                    <div class="pt-2 border-t border-stone-800 text-[11px]">
                      <span class="text-stone-500">Attachment:</span> <span class="text-stone-200 capitalize"><%= profile["attachment_style"] %></span>
                    </div>
                  <% end %>
                </div>
              <% end %>

              <!-- Orbital Command Actions -->
              <div class="space-y-2.5 pt-2">
                <h4 class="text-[11px] text-stone-400 font-mono uppercase font-bold tracking-wider">Orbital Actions</h4>
                
                <div class="grid grid-cols-2 gap-2">
                  <% {x, y} = @wiretap_data.coords %>
                  <button
                    phx-click="orbital_strike"
                    phx-value-map_id={@wiretap_data.map_id}
                    phx-value-x={x}
                    phx-value-y={y}
                    class="py-2.5 px-3 rounded bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 font-mono text-xs font-bold transition flex items-center justify-center space-x-1"
                  >
                    <span>⚡ Strike Target</span>
                  </button>

                  <button
                    phx-click="orbital_supply_drop"
                    phx-value-map_id={@wiretap_data.map_id}
                    phx-value-x={x}
                    phx-value-y={y}
                    class="py-2.5 px-3 rounded bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 font-mono text-xs font-bold transition flex items-center justify-center space-x-1"
                  >
                    <span>🎁 Supply Drop</span>
                  </button>
                </div>

                <!-- Omnipresent Whisper (for players) -->
                <%= if @wiretap_data.type == :player do %>
                  <form phx-submit="send_whisper" class="mt-2 flex space-x-2">
                    <input
                      type="text"
                      name="message"
                      placeholder="Whisper directly to target..."
                      class="flex-1 bg-stone-900 border border-stone-800 rounded px-3 py-1.5 text-xs text-stone-100 placeholder-stone-500 font-mono focus:border-cyan-500 focus:outline-none"
                    />
                    <button type="submit" class="px-3 py-1.5 rounded bg-cyan-900 hover:bg-cyan-800 border border-cyan-700 text-cyan-200 text-xs font-mono">
                      Whisper
                    </button>
                  </form>
                <% end %>
              </div>
            </div>
          <% else %>
            <!-- Empty state when no entity is selected -->
            <div class="rounded-xl border border-dashed border-cyan-900/40 p-8 text-center text-stone-500 font-mono text-xs flex flex-col items-center justify-center space-y-3">
              <div class="text-3xl opacity-40">📡</div>
              <p>NO TARGET LOCKED</p>
              <p class="text-stone-600 leading-relaxed">
                Click any blip on the tactical sonar radar to wiretap its conscious thoughts, read its bio-telemetry, or call down orbital interventions.
              </p>
            </div>
          <% end %>

          <!-- Predictive Threat / Ramsey Matrix Alerts -->
          <div class="space-y-2">
            <h3 class="text-xs font-mono uppercase text-rose-400 tracking-wider font-bold flex items-center space-x-1.5">
              <span>🚨</span>
              <span>Predictive Threat Matrix</span>
            </h3>

            <%= if @radar.critical_events == [] do %>
              <div class="text-xs text-stone-500 font-mono bg-stone-950/60 p-3 rounded border border-stone-800">
                All sectors stabilized. No imminent squad casualties detected.
              </div>
            <% else %>
              <%= for alert <- @radar.critical_events do %>
                <div class="bg-rose-950/40 border border-rose-900/60 p-2.5 rounded text-xs font-mono text-rose-300 flex items-start space-x-2">
                  <span class="text-rose-400 font-bold animate-pulse">!</span>
                  <div class="flex-1">
                    <span class="font-bold"><%= alert.target %>:</span> <%= alert.message %>
                  </div>
                </div>
              <% end %>
            <% end %>
          </div>
        </div>
      </div>
    </div>
    """
  end
end
