// =================================================================
// Phoenix Socket Connection — Singleton manager
// =================================================================
// Dynamic import to avoid SSR issues — phoenix accesses `self` at module scope
type PhoenixSocket = import("phoenix").Socket
let SocketClass: typeof import("phoenix").Socket | null = null
async function getSocketClass() {
  if (!SocketClass) {
    const mod = await import("phoenix")
    SocketClass = mod.Socket
  }
  return SocketClass
}

let socketInstance: PhoenixSocket | null = null

const TOKEN_KEY = "te_phoenix_token"

export function getSocket(): PhoenixSocket | null {
  return socketInstance
}

export function getStoredToken(): string | null {
  if (typeof localStorage === "undefined") return null
  return localStorage.getItem(TOKEN_KEY)
}

export function storeToken(token: string): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(TOKEN_KEY, token)
  }
}

export function clearToken(): void {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(TOKEN_KEY)
  }
}

export interface ConnectOptions {
  token: string
  onOpen?: () => void
  onClose?: (event: CloseEvent) => void
  onError?: (error: unknown) => void
}

export async function connectSocket(opts: ConnectOptions): Promise<PhoenixSocket> {
  if (socketInstance) {
    socketInstance.disconnect()
    socketInstance = null
  }

  const Socket = await getSocketClass()
  const wsUrl = buildWsUrl()

  socketInstance = new Socket(wsUrl, {
    params: { token: opts.token },
    reconnectAfterMs: (tries: number) =>
      [1000, 2000, 5000, 10_000][Math.min(tries - 1, 3)],
    heartbeatIntervalMs: 30_000,
    logger:
      process.env.NODE_ENV === "development"
        ? (kind: string, msg: string, data: unknown) =>
            console.debug(`[phx:${kind}]`, msg, data)
        : undefined,
  })

  if (opts.onOpen) socketInstance.onOpen(opts.onOpen)
  if (opts.onClose) socketInstance.onClose(opts.onClose as () => void)
  if (opts.onError) socketInstance.onError(opts.onError as () => void)

  socketInstance.connect()
  return socketInstance
}

export function disconnectSocket(): void {
  if (socketInstance) {
    socketInstance.disconnect()
    socketInstance = null
  }
}

function buildWsUrl(): string {
  const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL

  if (socketUrl) {
    try {
      const u = new URL(socketUrl)
      const proto = u.protocol === "https:" ? "wss:" : "ws:"
      // Dev: port 3001 (Node) → port 4000 (Phoenix)
      const port = u.port === "3001" ? "4000" : u.port
      return `${proto}//${u.hostname}${port ? ":" + port : ""}/socket/websocket`
    } catch {
      // If URL parsing fails, fall through to same-origin
    }
  }

  // Same-origin: derive from current page (production behind nginx)
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
    return `${proto}//${window.location.host}/socket/websocket`
  }

  return "ws://localhost:4000/socket/websocket"
}
