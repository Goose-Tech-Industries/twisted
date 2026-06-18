/**
 * ConfirmPhraseGate
 *
 * Hook for the type-to-confirm input on a destructive ConfirmAction
 * modal. Watches the input value; toggles the target button's
 * `disabled` attribute when the user's input exactly matches the
 * declared phrase (case-sensitive).
 *
 * Wired by data attributes on the input:
 *   data-phrase     — the phrase the user must type
 *   data-button-id  — DOM id of the button to enable/disable
 */
export const ConfirmPhraseGate = {
  mounted() {
    this.expected = this.el.dataset.phrase || ""
    this.buttonId = this.el.dataset.buttonId
    this.update = () => {
      const btn = document.getElementById(this.buttonId)
      if (!btn) return
      if (this.el.value === this.expected) {
        btn.removeAttribute("disabled")
      } else {
        btn.setAttribute("disabled", "true")
      }
    }
    this.el.addEventListener("input", this.update)
    // Initial state: ensure disabled.
    const btn = document.getElementById(this.buttonId)
    if (btn) btn.setAttribute("disabled", "true")
  },
  destroyed() {
    if (this.update) this.el.removeEventListener("input", this.update)
  },
}
