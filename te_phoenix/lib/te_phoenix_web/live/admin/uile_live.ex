defmodule TePhoenixWeb.Admin.UileLive do
  use TePhoenixWeb, :live_view

  alias TePhoenix.AI.{Uile, UileOperations}
  require Logger

  @impl true
  def mount(_params, _session, socket) do
    welcome_message = %{
      id: "uile_intro",
      role: "assistant",
      content: "I am **Uile** — the Omni-Architect and Living Worldforge (*Ildánach*). Speak your desires aloud or in text. We can spitball dungeons and lore, seed conscious psychological souls, inspect the realm with the God-Eye, or warp reality in real time.",
      audio_url: nil,
      timestamp: System.system_time(:second)
    }

    socket =
      socket
      |> assign(:page_title, "Uile — Omni Architect")
      |> assign(:messages, [welcome_message])
      |> assign(:input_text, "")
      |> assign(:active_plan, nil)
      |> assign(:execution_results, nil)
      |> assign(:voice_enabled, true)
      |> assign(:playing_audio, nil)
      |> assign(:loading, false)

    {:ok, socket}
  end

  @impl true
  def handle_event("send_message", %{"message" => text}, socket) do
    text = String.trim(text || "")

    if text == "" do
      {:noreply, socket}
    else
      user_msg = %{
        id: "msg_#{System.system_time(:millisecond)}",
        role: "user",
        content: text,
        audio_url: nil,
        timestamp: System.system_time(:second)
      }

      updated_messages = socket.assigns.messages ++ [user_msg]

      socket =
        socket
        |> assign(:messages, updated_messages)
        |> assign(:input_text, "")
        |> assign(:loading, true)

      chat_history =
        Enum.map(updated_messages, fn m ->
          %{role: m.role, content: m.content}
        end)

      case Uile.chat(chat_history, voice: socket.assigns.voice_enabled) do
        {:ok, %{message: reply, plan: plan, audio_url: audio}} ->
          bot_msg = %{
            id: "msg_#{System.system_time(:millisecond)}",
            role: "assistant",
            content: reply,
            audio_url: audio,
            timestamp: System.system_time(:second)
          }

          socket =
            socket
            |> assign(:messages, updated_messages ++ [bot_msg])
            |> assign(:active_plan, plan)
            |> assign(:playing_audio, audio)
            |> assign(:loading, false)
            |> push_event("uile_speak", %{text: reply, audio_url: audio})

          {:noreply, socket}

        {:error, reason} ->
          err_msg = %{
            id: "msg_#{System.system_time(:millisecond)}",
            role: "assistant",
            content: "⚠️ The Aether flickered: #{inspect(reason)}. Please rephrase your thought.",
            audio_url: nil,
            timestamp: System.system_time(:second)
          }

          {:noreply,
           socket
           |> assign(:messages, updated_messages ++ [err_msg])
           |> assign(:loading, false)}
      end
    end
  end

  @impl true
  def handle_event("quick_prompt", %{"prompt" => prompt}, socket) do
    handle_event("send_message", %{"message" => prompt}, socket)
  end

  @impl true
  def handle_event("toggle_voice", _params, socket) do
    {:noreply, assign(socket, :voice_enabled, !socket.assigns.voice_enabled)}
  end

  @impl true
  def handle_event("play_audio", %{"url" => url}, socket) do
    {:noreply, assign(socket, :playing_audio, url)}
  end

  @impl true
  def handle_event("execute_plan", _params, socket) do
    case socket.assigns.active_plan do
      nil ->
        {:noreply, put_flash(socket, :error, "No active blueprint to forge.")}

      plan ->
        case UileOperations.execute_plan(plan) do
          {:ok, results} ->
            receipt_msg = %{
              id: "exec_#{System.system_time(:millisecond)}",
              role: "assistant",
              content: "✨ **Blueprint Reality Forged!** #{length(results)} actions materialised across the universe.",
              audio_url: nil,
              timestamp: System.system_time(:second)
            }

            {:noreply,
             socket
             |> assign(:messages, socket.assigns.messages ++ [receipt_msg])
             |> assign(:execution_results, results)
             |> assign(:active_plan, nil)
             |> put_flash(:info, "Reality forged successfully!")}

          {:error, reason} ->
            {:noreply, put_flash(socket, :error, "Failed to forge reality: #{inspect(reason)}")}
        end
    end
  end

  @impl true
  def handle_event("dismiss_plan", _params, socket) do
    {:noreply, assign(socket, :active_plan, nil)}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="h-[calc(100vh-5rem)] flex flex-col bg-stone-950 text-stone-100 font-sans">
      <!-- Top Control Bar -->
      <div class="border-b border-stone-800 bg-stone-900/70 px-6 py-3 flex items-center justify-between backdrop-blur">
        <div class="flex items-center space-x-3">
          <div class="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 via-teal-600 to-indigo-700 flex items-center justify-center text-xl shadow-lg shadow-emerald-950">
            🌌
          </div>
          <div>
            <h1 class="text-lg font-bold tracking-wide text-stone-100 flex items-center space-x-2">
              <span>UILE</span>
              <span class="text-xs px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-300 border border-emerald-700/50 uppercase font-mono">
                Omni Architect (Ildánach)
              </span>
            </h1>
            <p class="text-xs text-stone-400">Living God-Engine • Consciousness Seeding • God-Eye Telemetry • Reality Warping</p>
          </div>
        </div>

        <div class="flex items-center space-x-4">
          <!-- Voice Toggle -->
          <button
            phx-click="toggle_voice"
            class={"px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center space-x-1.5 transition-colors " <>
              if(@voice_enabled, do: "bg-emerald-900/40 border-emerald-600 text-emerald-300", else: "bg-stone-800 border-stone-700 text-stone-400")}
          >
            <span><%= if @voice_enabled, do: "🔊 ElevenLabs Spoken", else: "🔇 Voice Muted" %></span>
          </button>

          <a href="/sauce/world/hub" class="text-xs text-stone-400 hover:text-stone-200 underline">World Hub</a>
          <a href="/sauce/entities/game_npcs" class="text-xs text-stone-400 hover:text-stone-200 underline">NPCs</a>
          <a href="/sauce/content" class="text-xs text-stone-400 hover:text-stone-200 underline">Items</a>
        </div>
      </div>

      <!-- Main Two-Column Workspace -->
      <div class="flex-1 flex overflow-hidden">
        <!-- Left: Chat & Ideation Terminal -->
        <div class="flex-1 flex flex-col border-r border-stone-800/80 bg-stone-950/90">
          <!-- Quick Pills -->
          <div class="px-6 py-2 border-b border-stone-800/60 bg-stone-900/30 flex items-center space-x-2 overflow-x-auto text-xs">
            <span class="text-stone-500 font-mono uppercase text-[10px]">Spitball:</span>
            <button phx-click="quick_prompt" phx-value-prompt="Let's forge the Sunken Forge dungeon with a clockwork guardian and lava hazards." class="px-2.5 py-1 rounded bg-stone-800/80 hover:bg-stone-700 text-stone-300 transition whitespace-nowrap">
              ⚔️ Sunken Forge Dungeon
            </button>
            <button phx-click="quick_prompt" phx-value-prompt="Inspect universe status and probe Vael's live mind." class="px-2.5 py-1 rounded bg-stone-800/80 hover:bg-stone-700 text-stone-300 transition whitespace-nowrap">
              👁️ God-Eye Mind Probe
            </button>
            <button phx-click="quick_prompt" phx-value-prompt="Broadcast a celestial eclipse event and shift the weather to blood rain." class="px-2.5 py-1 rounded bg-stone-800/80 hover:bg-stone-700 text-stone-300 transition whitespace-nowrap">
              🩸 Reality Warp Omen
            </button>
            <button phx-click="quick_prompt" phx-value-prompt="Simulate 50 years of faction history for the Ashveil Citadel." class="px-2.5 py-1 rounded bg-stone-800/80 hover:bg-stone-700 text-stone-300 transition whitespace-nowrap">
              ⏳ 50-Year Chronos Sim
            </button>
          </div>

          <!-- Message Transcript -->
          <div class="flex-1 p-6 overflow-y-auto space-y-4">
            <%= for msg <- @messages do %>
              <div class={"flex flex-col " <> if(msg.role == "user", do: "items-end", else: "items-start")}>
                <div class={"max-w-[85%] rounded-xl p-4 shadow-sm text-sm " <>
                  if(msg.role == "user",
                    do: "bg-indigo-600 text-white rounded-br-none",
                    else: "bg-stone-900/90 border border-stone-800 text-stone-200 rounded-bl-none")}>
                  
                  <div class="flex items-center justify-between mb-1.5 text-xs opacity-70">
                    <span class="font-bold flex items-center space-x-1">
                      <span><%= if msg.role == "user", do: "Creator", else: "Uile (Omni)" %></span>
                    </span>
                    <%= if msg.audio_url do %>
                      <button
                        phx-click="play_audio"
                        phx-value-url={msg.audio_url}
                        class="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60 hover:bg-emerald-900 transition flex items-center space-x-1 text-[11px]"
                      >
                        <span>🔊 Play Voice</span>
                      </button>
                    <% end %>
                  </div>

                  <div class="whitespace-pre-wrap leading-relaxed">
                    <%= msg.content %>
                  </div>
                </div>
              </div>
            <% end %>

            <%= if @loading do %>
              <div class="flex items-center space-x-2 text-stone-400 text-sm italic pl-2">
                <div class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                <span>Uile is weaving reality across the Aether...</span>
              </div>
            <% end %>
          </div>

          <!-- Audio Stream Player (Hidden auto-playing audio) -->
          <%= if @playing_audio do %>
            <div class="px-6 py-2 bg-emerald-950/40 border-t border-emerald-900/60 flex items-center justify-between">
              <span class="text-xs text-emerald-300 flex items-center space-x-2">
                <span class="animate-spin text-sm">💿</span>
                <span>Playing Uile Voice Stream...</span>
              </span>
              <audio src={@playing_audio} autoplay controls class="h-6 w-60"></audio>
            </div>
          <% end %>

          <!-- Input Bar with Hands-Free Voice Dictation -->
          <form
            id="uile-voice-form"
            phx-hook="UileVoice"
            phx-submit="send_message"
            class="p-4 border-t border-stone-800 bg-stone-900/50 flex items-center space-x-3"
          >
            <button
              type="button"
              data-role="mic-btn"
              title="Click to speak to Uile via Microphone"
              class="bg-stone-800 hover:bg-stone-700 text-stone-200 p-3 rounded-lg flex items-center justify-center transition focus:outline-none text-base border border-stone-700/60"
            >
              🎙️
            </button>
            <input
              type="text"
              name="message"
              value={@input_text}
              placeholder="Speak with microphone or type: spitball dungeons, inspect souls, command reality..."
              autocomplete="off"
              class="flex-1 bg-stone-950 border border-stone-800 rounded-lg px-4 py-3 text-stone-100 placeholder-stone-500 focus:outline-none focus:border-emerald-500 text-sm"
            />
            <button
              type="submit"
              class="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium px-5 py-3 rounded-lg text-sm shadow-md transition flex items-center space-x-1.5"
            >
              <span>Consult Uile</span>
            </button>
          </form>
        </div>

        <!-- Right: Blueprint Preview & Reality Inspector -->
        <div class="w-[420px] bg-stone-900/40 p-6 flex flex-col overflow-y-auto space-y-6">
          <%= if @active_plan do %>
            <div class="rounded-xl bg-stone-900 border border-emerald-500/40 p-5 shadow-xl relative overflow-hidden">
              <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-500"></div>

              <div class="flex items-center justify-between mb-3">
                <span class="text-xs uppercase font-mono tracking-wider text-emerald-400 font-bold">
                  Blueprint Ready
                </span>
                <button phx-click="dismiss_plan" class="text-stone-500 hover:text-stone-300 text-xs">
                  ✕ Dismiss
                </button>
              </div>

              <h2 class="text-lg font-bold text-stone-100 mb-1">
                <%= @active_plan["title"] %>
              </h2>
              <p class="text-xs text-stone-400 mb-4 leading-relaxed">
                <%= @active_plan["summary"] %>
              </p>

              <!-- Actions Checklist -->
              <div class="space-y-2 mb-6">
                <%= for act <- @active_plan["actions"] || [] do %>
                  <div class="flex items-center space-x-2 text-xs bg-stone-950/60 p-2 rounded border border-stone-800/80">
                    <span class="text-emerald-400 font-bold">▶</span>
                    <span class="font-mono text-stone-400 uppercase text-[10px] w-24"><%= act["action"] %>:</span>
                    <span class="text-stone-200 truncate flex-1"><%= act["name"] || act["title"] || act["weather"] || "Action" %></span>
                  </div>
                <% end %>
              </div>

              <button
                phx-click="execute_plan"
                class="w-full py-3 px-4 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:brightness-110 text-white font-bold text-sm shadow-lg shadow-emerald-950 transition flex items-center justify-center space-x-2"
              >
                <span>⚡ Forge Reality / Execute Blueprint</span>
              </button>
            </div>
          <% else %>
            <div class="rounded-xl border border-dashed border-stone-800 p-8 text-center text-stone-500 text-xs flex flex-col items-center justify-center space-y-3">
              <div class="text-3xl opacity-40">🔮</div>
              <p>No blueprint staged.</p>
              <p class="text-stone-600">Spitball ideas with Uile on the left. When an idea is finalized, its actionable plan card will appear here for 1-click execution.</p>
            </div>
          <% end %>

          <!-- Execution Receipts -->
          <%= if @execution_results do %>
            <div class="space-y-3">
              <h3 class="text-xs uppercase font-mono tracking-wider text-stone-400 font-bold">
                Reality Manifestation Receipts
              </h3>

              <%= for res <- @execution_results do %>
                <div class="rounded-lg bg-stone-950 border border-stone-800 p-3 text-xs flex flex-col space-y-1">
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-emerald-400 capitalize"><%= res.type %>: <%= res.name %></span>
                    <%= if res[:url] do %>
                      <a href={res.url} target="_blank" class="text-indigo-400 hover:underline">Edit ↗</a>
                    <% end %>
                  </div>
                  <p class="text-stone-400"><%= res.detail %></p>
                  <%= if res[:soul_id] do %>
                    <span class="text-[10px] text-teal-400 font-mono">SSE Soul: <%= res.soul_id %></span>
                  <% end %>
                  <%= if res[:chronicles] do %>
                    <ul class="text-[11px] text-stone-300 list-disc pl-4 space-y-0.5 pt-1">
                      <%= for epoch <- res.chronicles do %>
                        <li><%= epoch %></li>
                      <% end %>
                    </ul>
                  <% end %>
                </div>
              <% end %>
            </div>
          <% end %>
        </div>
      </div>
    </div>
    """
  end
end
