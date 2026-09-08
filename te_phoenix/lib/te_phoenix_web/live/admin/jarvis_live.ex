defmodule TePhoenixWeb.Admin.JarvisLive do
  @moduledoc """
  JARVIS: AI World Architect & System Co-Creator in AdminSauce.

  Allows creators to:
    1. Spitball ideas freely in natural conversation before building
    2. Review structured creation plans
    3. 1-click execute plans that create maps, NPCs, items, quests & rules
  """

  use TePhoenixWeb, :live_view
  alias TePhoenix.AI.{Jarvis, JarvisOperations}
  alias TePhoenixWeb.Components.PowerUserField

  @initial_message %{
    role: "assistant",
    content:
      "Good evening, Creator. I am JARVIS, your lead architect and systems designer. What are we designing today? We can spitball world lore, architect a multi-tiered dungeon, craft boss phases, or generate an entire populated zone. Where shall we start?"
  }

  @quick_prompts [
    "Spitball a subterranean bioluminescent dwarven laboratory",
    "Design a multi-phase dragon boss encounter with volcanic terrain",
    "Create a peaceful forest sanctuary with a wandering herbalist and 2 quests",
    "Draft an overgrown clockwork citadel ruled by an ancient autonomous sentinel"
  ]

  @impl true
  def mount(_params, _session, socket) do
    role_weight = PowerUserField.role_weight(socket.assigns[:session_role])

    if role_weight < 60 do
      {:ok, push_navigate(socket, to: "/sauce")}
    else
      {:ok,
       socket
       |> assign(:page_title, "JARVIS — World Architect")
       |> assign(:active_tab, :jarvis)
       |> assign(:role_weight, role_weight)
       |> assign(:messages, [@initial_message])
       |> assign(:input_text, "")
       |> assign(:loading, false)
       |> assign(:current_plan, nil)
       |> assign(:execution_results, [])
       |> assign(:quick_prompts, @quick_prompts)}
    end
  end

  @impl true
  def handle_event("update_input", %{"text" => text}, socket) do
    {:noreply, assign(socket, :input_text, text)}
  end

  @impl true
  def handle_event("send_message", %{"text" => text}, socket) do
    send_user_message(socket, text)
  end

  def handle_event("send_message", _, socket) do
    send_user_message(socket, socket.assigns.input_text)
  end

  @impl true
  def handle_event("quick_prompt", %{"prompt" => prompt}, socket) do
    send_user_message(socket, prompt)
  end

  @impl true
  def handle_event("execute_plan", _params, socket) do
    case socket.assigns.current_plan do
      nil ->
        {:noreply, socket}

      plan ->
        socket = assign(socket, :loading, true)

        case JarvisOperations.execute_plan(plan) do
          {:ok, results} ->
            summary_msg = %{
              role: "assistant",
              content:
                "Plan execution complete. I have constructed #{length(results)} new entities directly in the game database. You can inspect or refine any of them using the links below."
            }

            {:noreply,
             socket
             |> assign(:loading, false)
             |> assign(:execution_results, results)
             |> assign(:current_plan, nil)
             |> update(:messages, fn msgs -> msgs ++ [summary_msg] end)}

          {:error, reason} ->
            err_msg = %{
              role: "assistant",
              content: "I encountered an issue executing the plan: #{inspect(reason)}"
            }

            {:noreply,
             socket
             |> assign(:loading, false)
             |> update(:messages, fn msgs -> msgs ++ [err_msg] end)}
        end
    end
  end

  @impl true
  def handle_event("discard_plan", _params, socket) do
    discard_msg = %{
      role: "assistant",
      content: "Plan discarded. What direction would you like to explore instead?"
    }

    {:noreply,
     socket
     |> assign(:current_plan, nil)
     |> update(:messages, fn msgs -> msgs ++ [discard_msg] end)}
  end

  defp send_user_message(socket, text) do
    clean_text = String.trim(text || "")

    if clean_text == "" do
      {:noreply, socket}
    else
      user_msg = %{role: "user", content: clean_text}
      new_messages = socket.assigns.messages ++ [user_msg]

      user_id = socket.assigns[:current_user] && socket.assigns[:current_user].id

      case Jarvis.chat(new_messages, user_id: user_id) do
        {:ok, %{message: reply, plan: plan}} ->
          asst_msg = %{role: "assistant", content: reply}

          {:noreply,
           socket
           |> assign(:input_text, "")
           |> assign(:loading, false)
           |> assign(:messages, new_messages ++ [asst_msg])
           |> assign(:current_plan, plan || socket.assigns.current_plan)}

        _ ->
          fallback_msg = %{
            role: "assistant",
            content:
              "I'm considering that concept. Would you prefer to build the physical map first, or flesh out the lore and factions?"
          }

          {:noreply,
           socket
           |> assign(:input_text, "")
           |> assign(:loading, false)
           |> assign(:messages, new_messages ++ [fallback_msg])}
      end
    end
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="flex h-[calc(100vh-56px)] bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
      <!-- Main Chat / Brainstorming Column -->
      <div class="flex-1 flex flex-col border-r border-zinc-800">
        <!-- Top Header -->
        <header class="h-14 px-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60 backdrop-blur">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold text-sm shadow-[0_0_15px_rgba(245,158,11,0.15)]">
              J
            </div>
            <div>
              <h1 class="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                JARVIS <span class="text-xs font-normal text-amber-400/80 px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-800/60">World Architect</span>
              </h1>
              <p class="text-[11px] text-zinc-400">Conversational design & system creator</p>
            </div>
          </div>
          <div class="flex items-center gap-2 text-xs text-zinc-400">
            <span class="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Online & Ready to Build</span>
          </div>
        </header>

        <!-- Message Stream -->
        <div class="flex-1 overflow-y-auto p-6 space-y-4" id="jarvis-message-stream">
          <%= for m <- @messages do %>
            <div class={"flex gap-3 " <> if(m.role == "user", do: "justify-end", else: "justify-start")}>
              <%= if m.role == "assistant" do %>
                <div class="w-7 h-7 rounded-md bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 text-xs font-bold shrink-0 mt-0.5">
                  J
                </div>
              <% end %>

              <div class={"max-w-[75%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap " <>
                if(m.role == "user",
                  do: "bg-amber-600 text-white rounded-br-none shadow-md",
                  else: "bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-bl-none shadow-sm")}>
                {m.content}
              </div>

              <%= if m.role == "user" do %>
                <div class="w-7 h-7 rounded-md bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 text-xs font-bold shrink-0 mt-0.5">
                  You
                </div>
              <% end %>
            </div>
          <% end %>

          <%= if @loading do %>
            <div class="flex items-center gap-3 text-zinc-500 text-xs italic">
              <div class="w-2 h-2 rounded-full bg-amber-400 animate-ping"></div>
              <span>JARVIS is calculating architectural plan...</span>
            </div>
          <% end %>
        </div>

        <!-- Quick Prompt Pills -->
        <div class="px-6 py-2 border-t border-zinc-800/80 bg-zinc-900/30 flex items-center gap-2 overflow-x-auto text-xs">
          <span class="text-zinc-500 shrink-0 text-[11px] font-medium uppercase tracking-wider">Quick Ideas:</span>
          <%= for p <- @quick_prompts do %>
            <button
              phx-click="quick_prompt"
              phx-value-prompt={p}
              class="px-2.5 py-1 rounded-full bg-zinc-800/70 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 whitespace-nowrap transition-colors text-xs">
              ✨ {p}
            </button>
          <% end %>
        </div>

        <!-- Input Bar -->
        <div class="p-4 border-t border-zinc-800 bg-zinc-900/60">
          <form phx-submit="send_message" class="flex gap-2">
            <input
              type="text"
              name="text"
              value={@input_text}
              placeholder="Spitball an idea, describe a dungeon, or command JARVIS to build..."
              class="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/50"
              autocomplete="off"
            />
            <button
              type="submit"
              class="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-sm rounded-lg transition shadow-md flex items-center gap-1.5">
              <span>Send</span>
            </button>
          </form>
        </div>
      </div>

      <!-- Right Column: Live Plan & Execution Inspector -->
      <div class="w-96 flex flex-col bg-zinc-900/40 p-6 overflow-y-auto">
        <h2 class="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-4 flex items-center gap-2">
          <span>🛠️</span><span>Active Blueprint & Actions</span>
        </h2>

        <%= if @current_plan do %>
          <div class="bg-zinc-900 border border-amber-500/30 rounded-xl p-4 shadow-lg mb-6">
            <div class="flex items-start justify-between gap-2 mb-2">
              <h3 class="font-bold text-amber-400 text-sm leading-tight">
                {@current_plan["title"] || @current_plan[:title] || "Generated World Plan"}
              </h3>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 border border-amber-800 text-amber-300 shrink-0">
                {length(@current_plan["actions"] || @current_plan[:actions] || [])} Actions
              </span>
            </div>
            <p class="text-xs text-zinc-400 mb-4 leading-relaxed">
              {@current_plan["summary"] || @current_plan[:summary] || "Ready for database execution."}
            </p>

            <!-- Actions list -->
            <div class="space-y-2 mb-4 max-h-64 overflow-y-auto pr-1">
              <%= for act <- (@current_plan["actions"] || @current_plan[:actions] || []) do %>
                <div class="p-2 rounded bg-zinc-950/80 border border-zinc-800 text-xs">
                  <div class="font-medium text-zinc-200 flex items-center gap-1.5">
                    <span>{action_icon(act["action"] || act[:action])}</span>
                    <span class="capitalize">{String.replace(to_string(act["action"] || act[:action]), "_", " ")}</span>
                    <span class="text-zinc-500">—</span>
                    <span class="text-amber-300 truncate">{act["name"] || act[:name] || act["title"] || act[:title] || "Item"}</span>
                  </div>
                  <%= if (act["role"] || act[:role]) do %>
                    <div class="text-[11px] text-zinc-400 mt-0.5">Role: {act["role"] || act[:role]}</div>
                  <% end %>
                </div>
              <% end %>
            </div>

            <!-- Buttons -->
            <div class="flex gap-2">
              <button
                phx-click="execute_plan"
                class="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg transition shadow flex items-center justify-center gap-1">
                <span>⚡ Execute Plan in AdminSauce</span>
              </button>
              <button
                phx-click="discard_plan"
                class="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-lg transition">
                Discard
              </button>
            </div>
          </div>
        <% else %>
          <div class="p-6 rounded-xl border border-dashed border-zinc-800 text-center mb-6">
            <p class="text-xs text-zinc-500">
              No active blueprint pending.<br/>
              Spitball an idea in chat to generate an executable world blueprint.
            </p>
          </div>
        <% end %>

        <!-- Execution Receipts -->
        <%= if @execution_results != [] do %>
          <div>
            <h3 class="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-3 flex items-center gap-1.5">
              <span>✅</span><span>Creation Receipts</span>
            </h3>
            <div class="space-y-2">
              <%= for res <- @execution_results do %>
                <div class="p-3 rounded-lg bg-zinc-900 border border-emerald-900/60 text-xs">
                  <div class="flex items-center justify-between mb-1">
                    <span class="font-semibold text-zinc-100">{res.name}</span>
                    <span class="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                      {res.type}
                    </span>
                  </div>
                  <p class="text-[11px] text-zinc-400 mb-2">{res.detail}</p>
                  <a
                    href={res.url}
                    class="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:underline font-medium">
                    <span>Open in Admin Editor &rarr;</span>
                  </a>
                </div>
              <% end %>
            </div>
          </div>
        <% end %>
      </div>
    </div>
    """
  end

  defp action_icon("create_map"), do: "🗺️"
  defp action_icon("create_npc"), do: "👤"
  defp action_icon("create_spawn"), do: "📍"
  defp action_icon("create_item"), do: "⚔️"
  defp action_icon("create_quest"), do: "📜"
  defp action_icon("create_rule"), do: "⚖️"
  defp action_icon("create_status"), do: "✨"
  defp action_icon(_), do: "📦"
end
