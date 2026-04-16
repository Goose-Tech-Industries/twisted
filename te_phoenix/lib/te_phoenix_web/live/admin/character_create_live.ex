defmodule TePhoenixWeb.Admin.CharacterCreateLive do
  @moduledoc """
  Multi-step character creation wizard at /sauce/characters/create.
  Steps: Race -> Class -> Gender -> Attributes -> Name & Confirm.
  """

  use TePhoenixWeb, :live_view

  alias TePhoenix.Repo

  @base_point_pool 30
  @stat_keys ~w(hp mp atk def mo md speed luck)

  @impl true
  def mount(_params, session, socket) do
    user_id = session["user_id"]

    {:ok, assign(socket,
      user_id: user_id,
      step: 1,
      races: [],
      classes: [],
      genders: ["Male", "Female", "Non-Binary"],
      selected_race: nil,
      selected_race_name: nil,
      selected_class: nil,
      selected_class_name: nil,
      selected_gender: nil,
      char_name: "",
      point_pool: @base_point_pool,
      stats: %{"hp" => 0, "mp" => 0, "atk" => 0, "def" => 0, "mo" => 0, "md" => 0, "speed" => 0, "luck" => 0},
      error: nil,
      created_char_id: nil
    ) |> load_races()}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="max-w-2xl mx-auto p-6">
      <h1 class="text-2xl font-bold mb-6">Create Character</h1>

      <!-- Progress bar -->
      <div class="flex gap-1 mb-8">
        <%= for i <- 1..5 do %>
          <div class={[
            "h-2 flex-1 rounded",
            if(i <= @step, do: "bg-indigo-500", else: "bg-gray-700")
          ]}></div>
        <% end %>
      </div>

      <%= if @error do %>
        <div class="bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded mb-4"><%= @error %></div>
      <% end %>

      <%= if @created_char_id do %>
        <div class="bg-green-900/50 border border-green-500 text-green-200 px-6 py-4 rounded text-center">
          <p class="text-xl font-bold mb-2">Character Created!</p>
          <p><%= @char_name %> — Level 1 <%= @selected_race_name %> <%= @selected_class_name %></p>
        </div>
      <% else %>
        <%= case @step do %>
          <% 1 -> %>
            <.step_race races={@races} selected={@selected_race} />
          <% 2 -> %>
            <.step_class classes={@classes} selected={@selected_class} />
          <% 3 -> %>
            <.step_gender genders={@genders} selected={@selected_gender} />
          <% 4 -> %>
            <.step_attributes stats={@stats} pool={@point_pool} />
          <% 5 -> %>
            <.step_confirm
              name={@char_name}
              race={@selected_race_name}
              class_name={@selected_class_name}
              gender={@selected_gender}
              stats={@stats}
            />
        <% end %>

        <div class="flex justify-between mt-6">
          <%= if @step > 1 do %>
            <button phx-click="back" class="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600">Back</button>
          <% else %>
            <div></div>
          <% end %>

          <%= if @step < 5 do %>
            <button phx-click="next" class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-500">Next</button>
          <% else %>
            <button phx-click="create" class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-500">Create Character</button>
          <% end %>
        </div>
      <% end %>
    </div>
    """
  end

  # ── Step Components ──────────────────────────────────────────────

  defp step_race(assigns) do
    ~H"""
    <h2 class="text-lg font-semibold mb-4">Step 1: Choose Race</h2>
    <div class="grid grid-cols-2 gap-3">
      <%= for race <- @races do %>
        <button
          phx-click="select_race"
          phx-value-id={race.id}
          phx-value-name={race.name}
          class={[
            "p-4 rounded border text-left",
            if(race.id == @selected, do: "border-indigo-500 bg-indigo-900/30", else: "border-gray-700 bg-gray-800 hover:border-gray-500")
          ]}
        >
          <div class="font-bold"><%= race.name %></div>
          <div class="text-sm text-gray-400"><%= race.description %></div>
        </button>
      <% end %>
    </div>
    """
  end

  defp step_class(assigns) do
    ~H"""
    <h2 class="text-lg font-semibold mb-4">Step 2: Choose Class</h2>
    <div class="grid grid-cols-2 gap-3">
      <%= for cls <- @classes do %>
        <button
          phx-click="select_class"
          phx-value-id={cls.id}
          phx-value-name={cls.name}
          class={[
            "p-4 rounded border text-left",
            if(cls.id == @selected, do: "border-indigo-500 bg-indigo-900/30", else: "border-gray-700 bg-gray-800 hover:border-gray-500")
          ]}
        >
          <div class="font-bold"><%= cls.name %></div>
          <div class="text-sm text-gray-400"><%= cls.description %></div>
        </button>
      <% end %>
    </div>
    """
  end

  defp step_gender(assigns) do
    ~H"""
    <h2 class="text-lg font-semibold mb-4">Step 3: Choose Gender</h2>
    <div class="flex gap-4">
      <%= for g <- @genders do %>
        <button
          phx-click="select_gender"
          phx-value-gender={g}
          class={[
            "px-6 py-3 rounded border",
            if(g == @selected, do: "border-indigo-500 bg-indigo-900/30", else: "border-gray-700 bg-gray-800 hover:border-gray-500")
          ]}
        >
          <%= g %>
        </button>
      <% end %>
    </div>
    """
  end

  defp step_attributes(assigns) do
    ~H"""
    <h2 class="text-lg font-semibold mb-4">Step 4: Allocate Attribute Points</h2>
    <p class="text-gray-400 mb-4">Points remaining: <span class="font-bold text-white"><%= @pool %></span></p>
    <div class="space-y-3">
      <%= for key <- ~w(hp mp atk def mo md speed luck) do %>
        <div class="flex items-center gap-4">
          <span class="w-16 font-mono text-sm uppercase text-gray-300"><%= key %></span>
          <button phx-click="stat_dec" phx-value-stat={key}
            class="w-8 h-8 rounded bg-gray-700 hover:bg-gray-600 text-lg font-bold">-</button>
          <span class="w-8 text-center font-bold"><%= @stats[key] %></span>
          <button phx-click="stat_inc" phx-value-stat={key}
            class="w-8 h-8 rounded bg-gray-700 hover:bg-gray-600 text-lg font-bold">+</button>
        </div>
      <% end %>
    </div>
    """
  end

  defp step_confirm(assigns) do
    ~H"""
    <h2 class="text-lg font-semibold mb-4">Step 5: Name & Confirm</h2>
    <div class="space-y-4">
      <div>
        <label class="block text-sm text-gray-400 mb-1">Character Name</label>
        <input
          type="text"
          phx-change="update_name"
          phx-debounce="300"
          name="name"
          value={@name}
          class="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white"
          placeholder="Enter character name..."
          maxlength="24"
        />
      </div>
      <div class="bg-gray-800 rounded p-4 space-y-2">
        <div><span class="text-gray-400">Race:</span> <span class="font-bold"><%= @race %></span></div>
        <div><span class="text-gray-400">Class:</span> <span class="font-bold"><%= @class_name %></span></div>
        <div><span class="text-gray-400">Gender:</span> <span class="font-bold"><%= @gender %></span></div>
        <div class="pt-2 border-t border-gray-700">
          <span class="text-gray-400">Stats:</span>
          <div class="grid grid-cols-4 gap-2 mt-1">
            <%= for {k, v} <- @stats do %>
              <div class="text-sm"><span class="text-gray-500 uppercase"><%= k %>:</span> <span class="font-bold"><%= v %></span></div>
            <% end %>
          </div>
        </div>
      </div>
    </div>
    """
  end

  # ── Event Handlers ──────────────────────────────────────────────

  @impl true
  def handle_event("select_race", %{"id" => id, "name" => name}, socket) do
    {:noreply, assign(socket, selected_race: parse_int(id), selected_race_name: name, error: nil)}
  end

  def handle_event("select_class", %{"id" => id, "name" => name}, socket) do
    {:noreply, assign(socket, selected_class: parse_int(id), selected_class_name: name, error: nil)}
  end

  def handle_event("select_gender", %{"gender" => gender}, socket) do
    {:noreply, assign(socket, selected_gender: gender, error: nil)}
  end

  def handle_event("stat_inc", %{"stat" => stat}, socket) when stat in @stat_keys do
    if socket.assigns.point_pool > 0 do
      stats = Map.update!(socket.assigns.stats, stat, &(&1 + 1))
      {:noreply, assign(socket, stats: stats, point_pool: socket.assigns.point_pool - 1)}
    else
      {:noreply, socket}
    end
  end

  def handle_event("stat_dec", %{"stat" => stat}, socket) when stat in @stat_keys do
    current = socket.assigns.stats[stat]
    if current > 0 do
      stats = Map.update!(socket.assigns.stats, stat, &(&1 - 1))
      {:noreply, assign(socket, stats: stats, point_pool: socket.assigns.point_pool + 1)}
    else
      {:noreply, socket}
    end
  end

  def handle_event("update_name", %{"name" => name}, socket) do
    {:noreply, assign(socket, char_name: name, error: nil)}
  end

  def handle_event("next", _params, socket) do
    case validate_step(socket.assigns) do
      :ok ->
        socket = if socket.assigns.step == 1, do: load_classes(socket), else: socket
        {:noreply, assign(socket, step: socket.assigns.step + 1, error: nil)}
      {:error, msg} ->
        {:noreply, assign(socket, error: msg)}
    end
  end

  def handle_event("back", _params, socket) do
    {:noreply, assign(socket, step: max(1, socket.assigns.step - 1), error: nil)}
  end

  def handle_event("create", _params, socket) do
    a = socket.assigns
    cond do
      String.trim(a.char_name) == "" ->
        {:noreply, assign(socket, error: "Name is required.")}

      String.length(a.char_name) < 2 ->
        {:noreply, assign(socket, error: "Name must be at least 2 characters.")}

      String.length(a.char_name) > 24 ->
        {:noreply, assign(socket, error: "Name must be 24 characters or fewer.")}

      a.point_pool > 0 ->
        {:noreply, assign(socket, error: "You have #{a.point_pool} unspent attribute points.")}

      true ->
        case do_create(a) do
          {:ok, char_id} ->
            {:noreply, assign(socket, created_char_id: char_id, error: nil)}
          {:error, msg} ->
            {:noreply, assign(socket, error: msg)}
        end
    end
  end

  # ── Validation ──────────────────────────────────────────────────

  defp validate_step(%{step: 1, selected_race: nil}), do: {:error, "Please select a race."}
  defp validate_step(%{step: 2, selected_class: nil}), do: {:error, "Please select a class."}
  defp validate_step(%{step: 3, selected_gender: nil}), do: {:error, "Please select a gender."}
  defp validate_step(_), do: :ok

  # ── Data Loading ────────────────────────────────────────────────

  defp load_races(socket) do
    races = case Repo.query("SELECT id, name, description FROM game_races WHERE is_active=1 ORDER BY name") do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [id, name, desc] ->
          %{id: id, name: name, description: desc || ""}
        end)
      _ -> []
    end
    assign(socket, races: races)
  end

  defp load_classes(socket) do
    race_id = socket.assigns.selected_race

    classes = case Repo.query("""
      SELECT c.id, c.name, c.description
      FROM game_classes c
      LEFT JOIN game_race_classes rc ON rc.class_id = c.id
      WHERE c.is_active=1
        AND (rc.race_id = ? OR rc.race_id IS NULL)
      GROUP BY c.id
      ORDER BY c.name
    """, [race_id]) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [id, name, desc] ->
          %{id: id, name: name, description: desc || ""}
        end)
      _ ->
        # Fallback: load all classes if no race-class mapping exists
        case Repo.query("SELECT id, name, description FROM game_classes WHERE is_active=1 ORDER BY name") do
          {:ok, %{rows: rows}} ->
            Enum.map(rows, fn [id, name, desc] -> %{id: id, name: name, description: desc || ""} end)
          _ -> []
        end
    end

    assign(socket, classes: classes)
  end

  # ── Character Creation ──────────────────────────────────────────

  defp do_create(a) do
    name = String.trim(a.char_name)
    s = a.stats

    # Check name uniqueness
    case Repo.query("SELECT id FROM characters WHERE name=?", [name]) do
      {:ok, %{rows: [_]}} ->
        {:error, "That name is already taken."}
      _ ->
        try do
          {:ok, result} = Repo.query("""
            INSERT INTO characters (user_id, name, race_id, class_id, gender, level, experience,
              max_hp, current_hp, max_mp, current_mp,
              atk, def, mo, md, speed, luck,
              x, y, map_id, created_at)
            VALUES (?,?,?,?,?,1,0,
              ?,?,?,?,
              ?,?,?,?,?,?,
              5,5,1,NOW())
          """, [
            a.user_id, name, a.selected_race, a.selected_class, a.selected_gender,
            100 + s["hp"] * 10, 100 + s["hp"] * 10,
            50 + s["mp"] * 5, 50 + s["mp"] * 5,
            10 + s["atk"], 10 + s["def"],
            10 + s["mo"], 10 + s["md"],
            10 + s["speed"], 5 + s["luck"]
          ])

          {:ok, result.last_insert_id}
        rescue
          e -> {:error, "Creation failed: #{inspect(e)}"}
        end
    end
  end

  defp parse_int(val) when is_integer(val), do: val
  defp parse_int(val) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> n
      :error -> 0
    end
  end
  defp parse_int(_), do: 0
end
