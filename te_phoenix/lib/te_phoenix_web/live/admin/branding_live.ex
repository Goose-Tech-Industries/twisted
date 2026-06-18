defmodule TePhoenixWeb.Admin.BrandingLive do
  @moduledoc """
  Admin form for splash + login page branding.

  Live preview pane updates as you edit. Hits the same
  `system_settings` keys that `BrandingController` reads, so the
  SvelteKit player picks up changes on next page load.
  """

  use TePhoenixWeb, :live_view
  alias TePhoenix.Repo

  @defaults %{
    "splash_theme"           => "gothic",
    "splash_title"           => "Twisted Engine",
    "splash_tagline"         => "Tales from beneath the cairns",
    "splash_logo_url"        => "",
    "splash_bg_color_top"    => "#110608",
    "splash_bg_color_mid"    => "#050204",
    "splash_accent_color"    => "#b22222",
    "splash_atmosphere"      => "gothic",
    "splash_show_embers"     => "true",
    "splash_embers_count"    => "36",
    "splash_auto_redirect_ms"=> "1500",
    "login_subtitle"         => "Enter the realm",
    "login_button_login"     => "Enter",
    "login_button_register"  => "Forge",
    "login_quote"            => "",
    "login_quote_author"     => "",
    "login_register_enabled" => "true",
    "login_hero_image"       => ""
  }
  @keys Map.keys(@defaults)

  @themes ~w(gothic light parchment custom)
  @atmospheres ~w(gothic minimal none)

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(active_tab: :branding, themes: @themes, atmospheres: @atmospheres, flash_msg: nil)
     |> load_branding()}
  end

  defp load_branding(socket) do
    rows =
      case Repo.query(
        "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN (#{placeholders(@keys)})",
        @keys
      ) do
        {:ok, %{rows: rs}} -> Map.new(rs, fn [k, v] -> {to_string(k), to_string(v || "")} end)
        _ -> %{}
      end

    branding = Enum.reduce(@defaults, %{}, fn {k, dflt}, acc ->
      Map.put(acc, k, Map.get(rows, k, dflt))
    end)

    assign(socket, branding: branding)
  end

  @impl true
  def handle_event("ai:apply_brand_suggestion", %{"suggestion" => json}, socket) do
    branding = socket.assigns.branding

    new_branding =
      case Jason.decode(json) do
        {:ok, %{} = parsed} ->
          # Merge any branding key the AI returned that exists in our schema.
          Enum.reduce(parsed, branding, fn {k, v}, acc ->
            str_k = to_string(k)
            if Map.has_key?(branding, str_k), do: Map.put(acc, str_k, to_string(v)), else: acc
          end)

        _ ->
          branding
      end

    {:noreply,
     socket
     |> assign(:branding, new_branding)
     |> assign(:flash_msg, "AI palette applied — review and Save to commit.")}
  end

  def handle_event("ai:apply_brand_suggestion", _, socket), do: {:noreply, socket}

  def handle_event("update", params, socket) do
    new = Enum.reduce(@keys, socket.assigns.branding, fn k, acc ->
      Map.put(acc, k, Map.get(params, k, Map.get(acc, k)))
    end)
    {:noreply, assign(socket, branding: new)}
  end

  def handle_event("save", _params, socket) do
    for {k, v} <- socket.assigns.branding do
      Repo.query(
        """
        INSERT INTO system_settings (setting_key, setting_value, description, updated_at)
        VALUES (?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()
        """,
        [k, v, "Splash + login branding"]
      )
    end
    {:noreply, assign(socket, flash_msg: "Saved. The player picks it up on next page load.")}
  end

  def handle_event("reset", _params, socket) do
    {:noreply, assign(socket, branding: @defaults, flash_msg: "Reset to defaults — click Save to apply.")}
  end

  defp placeholders(list), do: list |> Enum.map(fn _ -> "?" end) |> Enum.join(",")

  @impl true
  def render(assigns) do
    ~H"""
    <div class="max-w-7xl mx-auto p-6">
      <header class="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 class="text-3xl font-bold text-zinc-100">Splash &amp; Login Branding</h1>
          <p class="text-zinc-400 text-sm mt-1">
            Controls the look of the public-facing pages — splash hero, login card, atmosphere, button copy.
            Stored as <code class="text-amber-300">splash_*</code> / <code class="text-amber-300">login_*</code> rows in <code>system_settings</code>.
          </p>
        </div>
        <.live_component
          module={TePhoenixWeb.Components.AiAssist}
          id="ai-brand-palette"
          feature_key="brand_palette"
          user_id={@session_user_id}
          role={@session_role}
          trigger_label="✨ Suggest palette"
          context={%{before_value: ""}}
          on_accept={Phoenix.LiveView.JS.push("ai:apply_brand_suggestion")} />
      </header>

      <%= if @flash_msg do %>
        <div class="mb-4 p-3 rounded bg-emerald-900/40 border border-emerald-700 text-emerald-200 text-sm">
          <%= @flash_msg %>
        </div>
      <% end %>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- ── FORM ─────────────────────────────────────────────── -->
        <form phx-change="update" phx-submit="save" class="space-y-6">

          <section class="bg-zinc-900/60 border border-zinc-800 rounded p-4">
            <h2 class="text-zinc-200 font-semibold mb-3">Identity</h2>
            <div class="grid grid-cols-1 gap-3">
              <label class="block text-sm">
                <span class="text-zinc-400">Title</span>
                <input type="text" name="splash_title" value={@branding["splash_title"]} maxlength="64" class="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-100" />
              </label>
              <label class="block text-sm">
                <span class="text-zinc-400">Tagline</span>
                <input type="text" name="splash_tagline" value={@branding["splash_tagline"]} maxlength="120" class="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-100" />
              </label>
              <label class="block text-sm">
                <span class="text-zinc-400">Logo URL <em class="text-zinc-600 not-italic">(optional)</em></span>
                <input type="url" name="splash_logo_url" value={@branding["splash_logo_url"]} class="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-100" placeholder="https://…" />
              </label>
            </div>
          </section>

          <section class="bg-zinc-900/60 border border-zinc-800 rounded p-4">
            <h2 class="text-zinc-200 font-semibold mb-3">Theme &amp; Atmosphere</h2>
            <div class="grid grid-cols-2 gap-3 text-sm">
              <label class="block">
                <span class="text-zinc-400">Theme</span>
                <select name="splash_theme" value={@branding["splash_theme"]} class="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-100">
                  <%= for t <- @themes do %>
                    <option value={t} selected={t == @branding["splash_theme"]}><%= String.capitalize(t) %></option>
                  <% end %>
                </select>
              </label>
              <label class="block">
                <span class="text-zinc-400">Atmosphere</span>
                <select name="splash_atmosphere" value={@branding["splash_atmosphere"]} class="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-100">
                  <%= for a <- @atmospheres do %>
                    <option value={a} selected={a == @branding["splash_atmosphere"]}><%= String.capitalize(a) %></option>
                  <% end %>
                </select>
              </label>
              <label class="block">
                <span class="text-zinc-400">BG color top</span>
                <input type="color" name="splash_bg_color_top" value={@branding["splash_bg_color_top"]} class="mt-1 w-full h-10 bg-zinc-950 border border-zinc-700 rounded cursor-pointer" />
              </label>
              <label class="block">
                <span class="text-zinc-400">BG color mid</span>
                <input type="color" name="splash_bg_color_mid" value={@branding["splash_bg_color_mid"]} class="mt-1 w-full h-10 bg-zinc-950 border border-zinc-700 rounded cursor-pointer" />
              </label>
              <label class="block col-span-2">
                <span class="text-zinc-400">Accent color</span>
                <input type="color" name="splash_accent_color" value={@branding["splash_accent_color"]} class="mt-1 w-full h-10 bg-zinc-950 border border-zinc-700 rounded cursor-pointer" />
              </label>
              <label class="block flex items-center gap-2">
                <input type="checkbox" name="splash_show_embers" value="true" checked={@branding["splash_show_embers"] in ["true", "1"]} class="w-4 h-4" />
                <span class="text-zinc-300">Show floating embers</span>
              </label>
              <label class="block">
                <span class="text-zinc-400">Embers count</span>
                <input type="number" name="splash_embers_count" min="0" max="200" value={@branding["splash_embers_count"]} class="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-100" />
              </label>
              <label class="block col-span-2">
                <span class="text-zinc-400">Auto-redirect (ms) <em class="text-zinc-600 not-italic">— how long the splash holds before bouncing</em></span>
                <input type="number" name="splash_auto_redirect_ms" min="0" max="30000" value={@branding["splash_auto_redirect_ms"]} class="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-100" />
              </label>
            </div>
          </section>

          <section class="bg-zinc-900/60 border border-zinc-800 rounded p-4">
            <h2 class="text-zinc-200 font-semibold mb-3">Login Page</h2>
            <div class="grid grid-cols-1 gap-3 text-sm">
              <label class="block">
                <span class="text-zinc-400">Subtitle</span>
                <input type="text" name="login_subtitle" value={@branding["login_subtitle"]} maxlength="80" class="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-100" />
              </label>
              <div class="grid grid-cols-2 gap-3">
                <label class="block">
                  <span class="text-zinc-400">Sign-in button</span>
                  <input type="text" name="login_button_login" value={@branding["login_button_login"]} maxlength="20" class="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-100" />
                </label>
                <label class="block">
                  <span class="text-zinc-400">Register button</span>
                  <input type="text" name="login_button_register" value={@branding["login_button_register"]} maxlength="20" class="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-100" />
                </label>
              </div>
              <label class="block">
                <span class="text-zinc-400">Flavor quote <em class="text-zinc-600 not-italic">(shown above the form)</em></span>
                <textarea name="login_quote" rows="2" maxlength="240" class="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-100"><%= @branding["login_quote"] %></textarea>
              </label>
              <label class="block">
                <span class="text-zinc-400">Quote attribution</span>
                <input type="text" name="login_quote_author" value={@branding["login_quote_author"]} maxlength="60" class="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-100" />
              </label>
              <label class="block">
                <span class="text-zinc-400">Hero image URL <em class="text-zinc-600 not-italic">(optional)</em></span>
                <input type="url" name="login_hero_image" value={@branding["login_hero_image"]} class="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-100" placeholder="https://…" />
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" name="login_register_enabled" value="true" checked={@branding["login_register_enabled"] in ["true", "1"]} class="w-4 h-4" />
                <span class="text-zinc-300">New registration enabled</span>
              </label>
            </div>
          </section>

          <div class="flex gap-2">
            <button type="submit" class="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-zinc-950 rounded font-semibold">Save</button>
            <button type="button" phx-click="reset" class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded">Reset to defaults</button>
          </div>
        </form>

        <!-- ── PREVIEW ──────────────────────────────────────────── -->
        <div class="space-y-4">
          <div class="bg-zinc-900/60 border border-zinc-800 rounded overflow-hidden">
            <div class="px-4 py-2 bg-zinc-900 border-b border-zinc-800 text-zinc-400 text-sm">Splash preview</div>
            <div
              class="aspect-[16/9] flex items-center justify-center relative overflow-hidden"
              style={"background: radial-gradient(ellipse at center, #{@branding["splash_bg_color_top"]} 0%, #{@branding["splash_bg_color_mid"]} 70%, #000 100%)"}
            >
              <div class="absolute inset-0" style={"background: radial-gradient(ellipse 60% 40% at 50% 0%, #{@branding["splash_accent_color"]}40, transparent 65%)"}></div>
              <div class="relative text-center px-6">
                <%= if @branding["splash_logo_url"] != "" do %>
                  <img src={@branding["splash_logo_url"]} alt="" class="mx-auto mb-3 max-h-20" />
                <% end %>
                <h3 class="text-2xl font-serif tracking-widest uppercase" style={"color: #ece6e3; text-shadow: 0 0 14px #{@branding["splash_accent_color"]}80"}>
                  <%= @branding["splash_title"] %>
                </h3>
                <p class="italic text-sm mt-1" style={"color: #{@branding["splash_accent_color"]}"}>
                  <%= @branding["splash_tagline"] %>
                </p>
              </div>
            </div>
          </div>

          <div class="bg-zinc-900/60 border border-zinc-800 rounded overflow-hidden">
            <div class="px-4 py-2 bg-zinc-900 border-b border-zinc-800 text-zinc-400 text-sm">Login preview</div>
            <div
              class="aspect-[4/3] flex items-center justify-center relative overflow-hidden p-6"
              style={"background: radial-gradient(ellipse at center, #{@branding["splash_bg_color_top"]} 0%, #{@branding["splash_bg_color_mid"]} 70%, #000 100%)"}
            >
              <div class="bg-zinc-900/90 border rounded p-5 max-w-xs w-full" style={"border-color: #{@branding["splash_accent_color"]}66"}>
                <h3 class="text-center font-serif uppercase tracking-widest text-xl" style={"color: #{@branding["splash_accent_color"]}"}>
                  <%= @branding["splash_title"] %>
                </h3>
                <p class="text-center italic text-xs mt-1" style={"color: #{@branding["splash_accent_color"]}cc"}>
                  <%= @branding["login_subtitle"] %>
                </p>
                <%= if @branding["login_quote"] != "" do %>
                  <blockquote class="mt-3 pt-3 border-t border-zinc-800 italic text-zinc-400 text-xs">
                    "<%= @branding["login_quote"] %>"
                    <%= if @branding["login_quote_author"] != "" do %>
                      <footer class="mt-1 text-zinc-500 not-italic">— <%= @branding["login_quote_author"] %></footer>
                    <% end %>
                  </blockquote>
                <% end %>
                <div class="mt-3 space-y-2">
                  <div class="bg-zinc-950 border border-zinc-700 rounded h-7"></div>
                  <div class="bg-zinc-950 border border-zinc-700 rounded h-7"></div>
                  <button type="button" class="w-full font-semibold uppercase tracking-wider py-2 rounded text-sm"
                    style={"background: linear-gradient(180deg, #{@branding["splash_accent_color"]}, #{@branding["splash_accent_color"]}88); color: #fff;"}>
                    <%= @branding["login_button_login"] %>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    """
  end
end
