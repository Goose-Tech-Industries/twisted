import { api } from '$phoenix/api'

export interface MailMessage {
  id: number
  sender_name: string
  recipient_name?: string
  subject: string
  body: string
  sent_at: string
  read?: boolean
  attached_gold?: number
  attached_items?: Array<{ item_id: number; qty: number }>
}

interface ListResp { success: boolean; mail?: MailMessage[] }
interface OneResp { success: boolean; message?: MailMessage }
interface UnreadResp { success: boolean; count?: number }
interface SendResp { success: boolean; message?: string }

function createMailStore() {
  let mail = $state<MailMessage[]>([])
  let unread = $state<number>(0)
  let opened = $state<MailMessage | null>(null)

  return {
    get mail() { return mail },
    get unread() { return unread },
    get opened() { return opened },

    async load() {
      const r = await api.get<ListResp>('/api/mail')
      mail = r.mail ?? []
      unread = mail.filter(m => !m.read).length
    },

    async loadUnreadCount() {
      const r = await api.get<UnreadResp>('/api/mail/unread-count')
      unread = r.count ?? 0
    },

    async open(id: number) {
      const r = await api.get<OneResp>(`/api/mail/${id}`)
      if (r.success && r.message) {
        opened = r.message
        mail = mail.map(m => m.id === id ? { ...m, read: true } : m)
        unread = mail.filter(m => !m.read).length
      }
    },

    async send(to: string, subject: string, body: string) {
      const r = await api.post<SendResp>('/api/mail/send', { to, subject, body })
      return r
    },

    async deleteMessage(id: number) {
      const r = await api.post<SendResp>(`/api/mail/${id}/delete`, {})
      if (r.success) {
        mail = mail.filter(m => m.id !== id)
        if (opened?.id === id) opened = null
      }
      return r
    },

    close() { opened = null }
  }
}

export const mail = createMailStore()
