// Type declarations for the phoenix npm package (Elixir Phoenix JS client)
declare module "phoenix" {
  export class Socket {
    constructor(endPoint: string, opts?: SocketOptions)
    connect(): void
    disconnect(callback?: () => void, code?: number, reason?: string): void
    onOpen(callback: () => void): void
    onClose(callback: () => void): void
    onError(callback: (error: unknown) => void): void
    onMessage(callback: (msg: object) => void): void
    channel(topic: string, chanParams?: object): Channel
    push(data: object): void
    isConnected(): boolean
    connectionState(): string
    log(kind: string, msg: string, data?: unknown): void
  }

  export interface SocketOptions {
    params?: Record<string, unknown> | (() => Record<string, unknown>)
    transport?: unknown
    timeout?: number
    heartbeatIntervalMs?: number
    reconnectAfterMs?: (tries: number) => number
    rejoinAfterMs?: (tries: number) => number
    logger?: (kind: string, msg: string, data: unknown) => void
    encode?: (payload: unknown, callback: (encoded: string) => void) => void
    decode?: (payload: string, callback: (decoded: unknown) => void) => void
    longpollerTimeout?: number
    vsn?: string
    binaryType?: "arraybuffer" | "blob"
  }

  export class Channel {
    constructor(topic: string, params: object, socket: Socket)
    join(timeout?: number): Push
    leave(timeout?: number): Push
    push(event: string, payload?: object, timeout?: number): Push
    on(event: string, callback: (payload: unknown) => void): number
    off(event: string, ref?: number): void
    onClose(callback: () => void): void
    onError(callback: (reason?: unknown) => void): void
    topic: string
    state: string
  }

  export class Push {
    receive(status: string, callback: (response: unknown) => void): Push
  }

  export class Presence {
    constructor(channel: Channel, opts?: object)
    onJoin(callback: (key: string, currentPresence: unknown, newPresence: unknown) => void): void
    onLeave(callback: (key: string, currentPresence: unknown, leftPresence: unknown) => void): void
    onSync(callback: () => void): void
    list<T = unknown>(chooser?: (key: string, presence: unknown) => T): T[]
    inPendingSyncState(): boolean
    static syncState(currentState: object, newState: object, onJoin?: Function, onLeave?: Function): object
    static syncDiff(currentState: object, diff: object, onJoin?: Function, onLeave?: Function): object
    static list<T = unknown>(presences: object, chooser?: (key: string, presence: unknown) => T): T[]
  }
}
