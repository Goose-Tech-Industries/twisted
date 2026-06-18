defmodule TePhoenixWeb.Components.ConfirmAction do
  @moduledoc """
  Tier α P5 — opt-in confirmation modal for destructive / reversible /
  info-class actions.

  Three kinds of UX:

    * `:destructive` — red header + type-to-confirm phrase. The Confirm
      button stays grey until the user types the exact phrase. Use for
      DROP/DELETE/PURGE/anything that loses data permanently.
    * `:reversible` — yellow header + plain Confirm/Cancel. Use for
      ban / role-change / restore-from-backup style actions whose
      consequences can be undone.
    * `:info` — neutral header + plain Confirm/Cancel. Use as a "are
      you sure" speed-bump for actions with no side-effects beyond
      navigation or visibility change.

  ## Usage

      <.confirm_action
        id="purge-table"
        kind={:destructive}
        title="Purge table"
        message="This drops all rows in `game_quests`. Cannot be undone."
        confirm_phrase="DROP QUESTS"
        confirm_label="Purge"
        on_confirm={JS.push("entity:purge", value: %{table: "game_quests"})}>
        <:trigger>
          <button class="btn-danger">Purge</button>
        </:trigger>
      </.confirm_action>

  The `<:trigger>` slot is what the user clicks to OPEN the dialog —
  this component owns both the trigger and the modal so the host LV
  doesn't have to manage open/close state.
  """

  use Phoenix.Component
  alias Phoenix.LiveView.JS

  attr :id, :string, required: true,
       doc: "Unique DOM id — used to scope the modal show/hide JS."

  attr :kind, :atom, default: :reversible,
       values: [:destructive, :reversible, :info]

  attr :title, :string, required: true
  attr :message, :string, default: nil

  attr :confirm_label, :string, default: "Confirm"
  attr :cancel_label, :string, default: "Cancel"

  attr :confirm_phrase, :string, default: nil,
       doc: "Required when kind=:destructive — user must type this verbatim."

  attr :on_confirm, :any, required: true,
       doc: "JS command (typically JS.push(...)) fired when user confirms."

  slot :trigger, required: true

  def confirm_action(assigns) do
    ~H"""
    <div class="inline-block">
      <div phx-click={open_modal(@id)} class="inline-block">
        {render_slot(@trigger)}
      </div>

      <div
        id={@id}
        class="hidden fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
        phx-click={close_modal(@id)}>
        <div
          class="w-[460px] bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl overflow-hidden"
          phx-click-away={close_modal(@id)}>
          <div class={[
            "px-4 py-3 border-b flex items-center justify-between",
            kind_header_class(@kind)
          ]}>
            <h3 class="text-sm font-bold flex items-center gap-2">
              <span>{kind_icon(@kind)}</span>
              <span>{@title}</span>
            </h3>
            <button type="button" phx-click={close_modal(@id)}
              class="text-zinc-500 hover:text-zinc-200 text-lg leading-none">✕</button>
          </div>

          <div class="p-4 space-y-3">
            <p :if={@message} class="text-xs text-zinc-300 leading-relaxed">{@message}</p>

            <div :if={@kind == :destructive and @confirm_phrase}
              class="space-y-1.5 pt-1 border-t border-zinc-800">
              <label class="text-[10px] uppercase tracking-wider text-zinc-500">
                Type <code class="bg-zinc-800 px-1.5 py-0.5 rounded text-rose-300 font-mono">{@confirm_phrase}</code> to confirm
              </label>
              <input
                id={"#{@id}-phrase"}
                type="text"
                autocomplete="off"
                spellcheck="false"
                phx-hook="ConfirmPhraseGate"
                data-phrase={@confirm_phrase}
                data-button-id={"#{@id}-confirm"}
                class="w-full px-2 py-1.5 text-sm font-mono bg-zinc-900 border border-zinc-700 rounded text-zinc-100 focus:outline-none focus:border-rose-500" />
            </div>
          </div>

          <div class="px-4 py-3 border-t border-zinc-800 flex items-center justify-end gap-2 bg-zinc-950/50">
            <button type="button" phx-click={close_modal(@id)}
              class="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs">
              {@cancel_label}
            </button>
            <button
              id={"#{@id}-confirm"}
              type="button"
              phx-click={JS.exec("phx-click", to: "##{@id}-on-confirm") |> close_modal(@id)}
              disabled={@kind == :destructive and not is_nil(@confirm_phrase)}
              class={[
                "px-3 py-1.5 rounded text-xs font-bold transition-colors",
                kind_confirm_class(@kind),
                "disabled:opacity-30 disabled:cursor-not-allowed"
              ]}>
              {@confirm_label}
            </button>
            <span id={"#{@id}-on-confirm"} phx-click={@on_confirm} class="hidden"></span>
          </div>
        </div>
      </div>
    </div>
    """
  end

  defp open_modal(id) do
    JS.show(to: "##{id}", transition: {"transition-opacity", "opacity-0", "opacity-100"})
  end

  defp close_modal(js \\ %JS{}, id) do
    js
    |> JS.hide(to: "##{id}")
    |> JS.set_attribute({"value", ""}, to: "##{id}-phrase")
    |> JS.set_attribute({"disabled", "true"}, to: "##{id}-confirm")
  end

  defp kind_header_class(:destructive), do: "border-rose-800 bg-rose-950/30 text-rose-300"
  defp kind_header_class(:reversible), do: "border-amber-800 bg-amber-950/30 text-amber-300"
  defp kind_header_class(:info), do: "border-zinc-800 bg-zinc-950/30 text-zinc-300"

  defp kind_icon(:destructive), do: "⚠"
  defp kind_icon(:reversible), do: "↻"
  defp kind_icon(:info), do: "ⓘ"

  defp kind_confirm_class(:destructive), do: "bg-rose-700 hover:bg-rose-600 text-white"
  defp kind_confirm_class(:reversible), do: "bg-amber-700 hover:bg-amber-600 text-black"
  defp kind_confirm_class(:info), do: "bg-emerald-700 hover:bg-emerald-600 text-white"
end
