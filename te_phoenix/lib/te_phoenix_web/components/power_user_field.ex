defmodule TePhoenixWeb.Components.PowerUserField do
  @moduledoc """
  Wrapper for any admin form field that wants to expose BOTH a
  no-code-by-default structured editor AND a power-user raw view
  (typically a JSON textarea). The raw toggle only appears for users
  whose role weight meets `:advanced_role_min` (default 90 → ADMIN+).

  Toggle preference persists per user via `TePhoenix.UserPrefs`.

  ## Usage

      <.power_user_field
        label="Trigger condition"
        help_text="Fires this rule when the conditions match."
        field={@form[:condition_json]}
        user_id={@session_user_id}
        role_weight={@role_weight}
        view={@field_views["combat_rule.condition_json"]}
        form_id="combat_rule"
        field_name="condition_json">
        <:structured>
          <.rule_builder schema={...} field={@form[:condition_json]} />
        </:structured>
        <:raw>
          <.input field={@form[:condition_json]} type="textarea" rows="6" />
        </:raw>
      </.power_user_field>

  The calling LiveView is responsible for:
    * computing `:role_weight` (use `role_weight_for/1`)
    * hydrating `:field_views` from `UserPrefs.all_for/1` on mount
    * handling the `power_user_field:toggle` event (helper provided)
  """

  use Phoenix.Component
  alias Phoenix.LiveView.JS
  alias TePhoenix.UserPrefs

  # ── role weight lookup ─────────────────────────────────────────
  # Mirrors the canonical seed in `game_roles`. Cached as module
  # attribute so it's compile-time inlined; if a deployment changes
  # role weights at runtime, restart Phoenix to pick up the new map.
  @role_weights %{
    "OWNER" => 100,
    "ADMIN" => 90,
    "GM" => 80,
    "MOD" => 70,
    "STAFF" => 60,
    "PREMIUM" => 20,
    "CONTENT_CREATOR" => 15,
    "PLAYER" => 0
  }

  @doc """
  Map a role string OR a user-struct-shaped map to its numeric weight.
  Unknown roles return 0 (player baseline).
  """
  def role_weight_for(input), do: role_weight(input)

  @doc "Alias of role_weight_for/1. Accepts strings, user structs, or nil."
  def role_weight(nil), do: 0
  def role_weight(role) when is_binary(role), do: Map.get(@role_weights, String.upcase(role), 0)
  def role_weight(%{role: r}) when is_binary(r), do: role_weight(r)
  def role_weight(%{"role" => r}) when is_binary(r), do: role_weight(r)
  def role_weight(_), do: 0

  @doc """
  Build the `:field_views` map a LiveView should put in assigns. Pulls
  every `field_view:*` pref this user has set in one query.
  """
  def load_field_views(user_id) when is_integer(user_id) do
    user_id
    |> UserPrefs.all_for()
    |> Enum.flat_map(fn {k, v} ->
      case k do
        "field_view:" <> rest -> [{rest, v}]
        _ -> []
      end
    end)
    |> Map.new()
  end

  def load_field_views(_), do: %{}

  @doc """
  Persist a field-view preference. Returns `:ok`. Wire this into a
  `handle_event("power_user_field:toggle", ...)` clause in your LV.
  """
  def toggle_view(user_id, form_id, field_name, view)
      when view in ["structured", "raw"] do
    key = "field_view:#{form_id}.#{field_name}"
    UserPrefs.put(user_id, key, view)
  end

  def toggle_view(_, _, _, _), do: :ok

  # ── component ───────────────────────────────────────────────────

  attr :label, :string, required: true
  attr :help_text, :string, default: nil
  attr :field, Phoenix.HTML.FormField, default: nil
  attr :advanced_role_min, :integer, default: 90
  attr :role_weight, :integer, default: 0
  attr :user_id, :integer, default: nil
  attr :form_id, :string, required: true,
       doc: "Used to scope the user_prefs key. Typically the form's resource name (e.g., \"combat_rule\")."
  attr :field_name, :string, required: true,
       doc: "The schema field name (e.g., \"condition_json\"). Combined with form_id for the pref key."
  attr :view, :string, default: "structured",
       doc: "Initial view to render — \"structured\" or \"raw\". Read from @field_views in the calling LV."
  attr :class, :string, default: ""

  slot :structured, required: true
  slot :raw, required: true

  def power_user_field(assigns) do
    assigns =
      assigns
      |> assign(:can_advanced, assigns.role_weight >= assigns.advanced_role_min)
      |> assign(:current_view, normalize_view(assigns.view))
      |> assign(:pref_key, "field_view:#{assigns.form_id}.#{assigns.field_name}")
      |> assign(:wrapper_id, "puf-#{assigns.form_id}-#{assigns.field_name}")

    ~H"""
    <div id={@wrapper_id} class={["mb-4", @class]} data-power-user-field={@pref_key}>
      <div class="flex items-start justify-between mb-1">
        <div>
          <label class="block text-sm font-medium text-zinc-200">
            {@label}
          </label>
          <p :if={@help_text} class="text-xs text-zinc-500 mt-0.5">{@help_text}</p>
        </div>

        <button
          :if={@can_advanced}
          type="button"
          phx-click={
            JS.push("power_user_field:toggle",
              value: %{
                pref_key: @pref_key,
                form_id: @form_id,
                field_name: @field_name,
                view: if(@current_view == "raw", do: "structured", else: "raw")
              }
            )
          }
          class={[
            "shrink-0 ml-3 px-2 py-0.5 text-xs font-mono rounded border transition-colors",
            @current_view == "raw" &&
              "bg-amber-500/15 border-amber-500/50 text-amber-300 hover:bg-amber-500/25",
            @current_view == "structured" &&
              "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600"
          ]}
          title={
            if @current_view == "raw",
              do: "Switch back to the structured editor",
              else: "Reveal the raw JSON (advanced)"
          }
        >
          <%= if @current_view == "raw" do %>
            structured
          <% else %>
            &lt;/&gt; raw
          <% end %>
        </button>
      </div>

      <div :if={@current_view == "structured" or not @can_advanced}>
        {render_slot(@structured)}
      </div>

      <div :if={@can_advanced and @current_view == "raw"}>
        <div class="mb-1 px-2 py-1 text-[10px] uppercase tracking-wider text-amber-400/70 bg-amber-500/5 border-l-2 border-amber-500/40 rounded-r">
          Raw mode — advanced. Save round-trips through the structured editor's parser.
        </div>
        {render_slot(@raw)}
      </div>
    </div>
    """
  end

  defp normalize_view(v) when v in ["structured", "raw"], do: v
  defp normalize_view(_), do: "structured"

  # ── LV-side toggle handler helper ──────────────────────────────

  @doc """
  Default implementation for `handle_event("power_user_field:toggle", ...)`.
  Updates the per-user pref and the LV's `:field_views` assign.

  ## Example

      def handle_event("power_user_field:toggle", params, socket) do
        TePhoenixWeb.Components.PowerUserField.handle_toggle(params, socket)
      end
  """
  def handle_toggle(%{"form_id" => form_id, "field_name" => field_name, "view" => view}, socket) do
    user_id = socket.assigns[:session_user_id]
    toggle_view(user_id, form_id, field_name, view)

    field_views =
      socket.assigns
      |> Map.get(:field_views, %{})
      |> Map.put("#{form_id}.#{field_name}", view)

    {:noreply, Phoenix.Component.assign(socket, :field_views, field_views)}
  end

  def handle_toggle(_, socket), do: {:noreply, socket}
end
