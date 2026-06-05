// Toast queue — every component can `notifications.push(...)` and the
// global `<Toasts />` element renders them. Auto-dismiss after a delay.

export type NotificationType =
  | 'info' | 'success' | 'warning' | 'error'
  | 'item' | 'heal' | 'damage' | 'xp' | 'gold'

export interface Notification {
  id: number
  type: NotificationType
  message: string
  expiresAt: number
}

let nextId = 1

function createNotificationStore() {
  let items = $state<Notification[]>([])

  return {
    get items() { return items },

    push(type: NotificationType, message: string, durationMs = 4000) {
      const note: Notification = {
        id: nextId++,
        type,
        message,
        expiresAt: Date.now() + durationMs
      }
      items = [...items, note]
      setTimeout(() => this.dismiss(note.id), durationMs)
    },

    dismiss(id: number) {
      items = items.filter(n => n.id !== id)
    },

    clear() { items = [] }
  }
}

export const notifications = createNotificationStore()
