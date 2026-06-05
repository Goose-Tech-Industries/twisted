// Multi-channel chat buffer. Phoenix social/* + game/* push messages here.

export type ChatChannel = 'global' | 'local' | 'party' | 'guild' | 'whisper' | 'system'

export interface ChatMessage {
  id: number
  channel: ChatChannel
  from: string
  fromColor?: string | null
  body: string
  ts: number
  fromRole?: string
}

let nextId = 1

const MAX_PER_CHANNEL = 500

function createChatStore() {
  let byChannel = $state<Record<ChatChannel, ChatMessage[]>>({
    global: [], local: [], party: [], guild: [], whisper: [], system: []
  })
  let active = $state<ChatChannel>('global')
  let unread = $state<Record<ChatChannel, number>>({
    global: 0, local: 0, party: 0, guild: 0, whisper: 0, system: 0
  })

  return {
    get byChannel() { return byChannel },
    get active() { return active },
    get unread() { return unread },
    get messages() { return byChannel[active] },

    push(channel: ChatChannel, msg: Omit<ChatMessage, 'id' | 'ts' | 'channel'>) {
      const full: ChatMessage = { ...msg, channel, id: nextId++, ts: Date.now() }
      const list = byChannel[channel]
      const next = [...list, full]
      if (next.length > MAX_PER_CHANNEL) next.shift()
      byChannel = { ...byChannel, [channel]: next }
      if (channel !== active) {
        unread = { ...unread, [channel]: unread[channel] + 1 }
      }
    },

    setActive(channel: ChatChannel) {
      active = channel
      unread = { ...unread, [channel]: 0 }
    },

    clear(channel?: ChatChannel) {
      if (channel) byChannel = { ...byChannel, [channel]: [] }
      else byChannel = { global: [], local: [], party: [], guild: [], whisper: [], system: [] }
    }
  }
}

export const chat = createChatStore()
