defmodule TePhoenixWeb.CoreComponents do
  @moduledoc """
  Shared UI components for AdminSauce LiveView.
  """
  use Phoenix.Component
  use Phoenix.VerifiedRoutes, endpoint: TePhoenixWeb.Endpoint, router: TePhoenixWeb.Router

  # ── Nav Link ─────────────────────────────────────────────────────

  attr :href, :string, required: true
  attr :icon, :string, required: true
  attr :label, :string, required: true
  attr :active, :boolean, default: false

  def nav_link(assigns) do
    ~H"""
    <a href={@href} class={[
      "flex items-center gap-2.5 px-4 py-2 text-sm transition-colors",
      @active && "bg-amber-500/10 text-amber-400 border-r-2 border-amber-400 font-medium",
      !@active && "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30"
    ]}>
      <span class="w-4 text-center text-xs shrink-0"><.icon name={@icon} /></span>
      <span class="truncate">{@label}</span>
      <span :if={@active} class="ml-auto text-amber-400/50 text-xs shrink-0">›</span>
    </a>
    """
  end

  # ── Icon ─────────────────────────────────────────────────────────

  @icon_map %{
    "chart" => "📊", "cog" => "⚙️", "table" => "📋", "users" => "👥",
    "map" => "🗺️", "user" => "👤", "box" => "📦", "scroll" => "📜",
    "zap" => "⚡", "shield" => "🛡️", "megaphone" => "📢", "globe" => "🌍",
    "clock" => "🕐", "skull" => "💀", "store" => "🏪", "barchart" => "📈",
    "droplets" => "💧", "trophy" => "🏆", "gamepad" => "🎮", "award" => "🏅",
    "wand" => "🪄", "gem" => "💎", "pen" => "✏️", "activity" => "📡"
  }

  attr :name, :string, required: true

  def icon(assigns) do
    assigns = assign(assigns, :symbol, Map.get(@icon_map, assigns.name, "•"))

    ~H"""
    <span>{@symbol}</span>
    """
  end

  # ── Flash ────────────────────────────────────────────────────────

  def flash_group(assigns) do
    ~H"""
    <div :if={Phoenix.Flash.get(@flash, :info)} class="mb-4 p-3 bg-blue-950/50 border border-blue-800 rounded-lg text-sm text-blue-300">
      {Phoenix.Flash.get(@flash, :info)}
    </div>
    <div :if={Phoenix.Flash.get(@flash, :error)} class="mb-4 p-3 bg-red-950/50 border border-red-800 rounded-lg text-sm text-red-300">
      {Phoenix.Flash.get(@flash, :error)}
    </div>
    """
  end

  # ── Button ───────────────────────────────────────────────────────

  attr :label, :string, default: nil
  attr :class, :string, default: ""
  attr :rest, :global, include: ~w(type disabled form phx-click phx-disable-with)
  slot :inner_block

  def button(assigns) do
    ~H"""
    <button class={[
      "px-4 py-2 rounded font-medium text-sm transition-colors",
      "bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50 disabled:cursor-not-allowed",
      @class
    ]} {@rest}>
      {render_slot(@inner_block) || @label}
    </button>
    """
  end

  # ── Stat Card ────────────────────────────────────────────────────

  attr :label, :string, required: true
  attr :value, :string, default: ""
  attr :class, :string, default: ""

  def stat_card(assigns) do
    ~H"""
    <div class={"bg-zinc-900 border border-zinc-800 rounded-xl p-4 #{@class}"}>
      <div class="text-xs text-zinc-500 uppercase tracking-wider mb-1">{@label}</div>
      <div class="text-2xl font-bold text-zinc-100">{@value}</div>
    </div>
    """
  end

  # ── Stat Card with Icon ──────────────────────────────────────────

  attr :label, :string, required: true
  attr :value, :string, default: "0"
  attr :icon_emoji, :string, required: true
  attr :class, :string, default: ""

  def stat_card_icon(assigns) do
    ~H"""
    <div class={"bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center #{@class}"}>
      <div class="text-2xl mb-1">{@icon_emoji}</div>
      <div class="text-2xl font-bold text-zinc-100">{@value}</div>
      <div class="text-[10px] text-zinc-500 uppercase tracking-wider mt-1">{@label}</div>
    </div>
    """
  end

  # ── Styled Name (gradient/glow/custom color) ─────────────────────

  attr :name, :string, required: true
  attr :role, :string, default: "PLAYER"
  attr :chat_color, :string, default: nil
  attr :class, :string, default: "text-sm font-medium"

  def styled_name(assigns) do
    has_custom = assigns.chat_color != nil and assigns.chat_color != ""
    is_gradient = has_custom and String.starts_with?(to_string(assigns.chat_color), "gradient:")

    effect_class = cond do
      is_gradient -> "staff-name-custom-gradient"
      has_custom -> ""
      true ->
        case assigns.role do
          "OWNER" -> "staff-name-owner"
          "ADMIN" -> "staff-name-admin"
          "GM" -> "staff-name-gm"
          "MOD" -> "staff-name-mod"
          _ -> ""
        end
    end

    fallback_color = cond do
      has_custom -> ""
      true ->
        case assigns.role do
          "OWNER" -> ""
          "ADMIN" -> "text-red-400"
          "GM" -> "text-purple-400"
          "MOD" -> "text-green-400"
          "STAFF" -> "text-cyan-400"
          _ -> "text-zinc-300"
        end
    end

    custom_style = cond do
      is_gradient ->
        gradient_css = String.replace_prefix(to_string(assigns.chat_color), "gradient:", "")
        "background: #{gradient_css}; background-size: 300% 100%; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; animation: owner-rainbow 6s linear infinite;"
      has_custom -> "color: #{assigns.chat_color}"
      true -> nil
    end

    assigns = assign(assigns,
      effect_class: effect_class,
      fallback_color: fallback_color,
      custom_style: custom_style
    )

    ~H"""
    <span class={[@class, @effect_class, @fallback_color]} style={@custom_style}>
      {@name}
    </span>
    """
  end

  # ── Role Badge ───────────────────────────────────────────────────

  attr :role, :string, required: true

  def role_badge(assigns) do
    assigns = assign(assigns, :color_classes, role_color(assigns.role))

    ~H"""
    <span class={[
      "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
      @color_classes
    ]}>
      {@role}
    </span>
    """
  end

  defp role_color(role) when role in ["OWNER", "ADMIN"], do: "bg-red-500/10 text-red-400 border border-red-500/20"
  defp role_color("GM"), do: "bg-purple-500/10 text-purple-400 border border-purple-500/20"
  defp role_color("MOD"), do: "bg-blue-500/10 text-blue-400 border border-blue-500/20"
  defp role_color(_), do: "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20"
end
