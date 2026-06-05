// Dialogue overlay — driven entirely by Phoenix `dialogue` push and
// the social channel's `npc_reply` / `dialogue_options`. The local
// store just holds the current dialogue tree state.

export interface DialogueChoice {
  id: string
  label: string
  /** Optional condition descriptor — locked choices are still listed but disabled. */
  locked?: boolean
  reason?: string
}

export interface DialogueLine {
  speaker: string
  body: string
  /** Speaker portrait — emoji or sprite_url. */
  portrait?: string
  choices?: DialogueChoice[]
  /** Server may push an end marker so the client closes the overlay. */
  end?: boolean
}

function createDialogueStore() {
  let line = $state<DialogueLine | null>(null)
  let history = $state<DialogueLine[]>([])

  return {
    get line() { return line },
    get history() { return history },

    show(next: DialogueLine) {
      if (line) history = [...history, line].slice(-10)
      line = next
      if (next.end) {
        // close shortly after so the user sees the closing line
        setTimeout(() => this.close(), 1200)
      }
    },

    close() {
      line = null
      history = []
    }
  }
}

export const dialogue = createDialogueStore()
