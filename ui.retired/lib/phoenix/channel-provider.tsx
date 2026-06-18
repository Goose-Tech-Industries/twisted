"use client"

// =================================================================
// Phoenix Channel Provider — Owns Socket + all Channel refs
// =================================================================
import React, {
  createContext,
  useContext,
  useRef,
  useCallback,
  useEffect,
  useState,
} from "react"
// Type-only import — safe for SSR (no runtime code executed)
import type { Channel } from "phoenix"
import {
  connectSocket,
  disconnectSocket,
  getSocket,
  storeToken,
  clearToken,
  getStoredToken,
} from "./connection"

// ─── Context shape ──────────────────────────────────────────────
interface ChannelContextValue {
  // Connection state
  isConnected: boolean

  // Channel refs (null until joined)
  gameChannel: Channel | null
  socialChannel: Channel | null
  battleLobbyChannel: Channel | null
  userChannel: Channel | null
  mapChannel: Channel | null
  activeBattleChannel: Channel | null

  // Lifecycle methods
  connect: (token: string) => void
  disconnect: () => void
  joinUserChannel: (charId: number) => void
  joinMapChannel: (mapId: number) => void
  joinBattleChannel: (battleId: number) => Channel | null
  leaveBattleChannel: () => void
}

const ChannelContext = createContext<ChannelContextValue | null>(null)

// ─── Provider ───────────────────────────────────────────────────
export function ChannelProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false)
  const [, rerender] = useState(0)
  const bump = () => rerender((n) => n + 1)

  // Channel refs — mutable, trigger re-render via bump()
  const gameRef = useRef<Channel | null>(null)
  const socialRef = useRef<Channel | null>(null)
  const battleLobbyRef = useRef<Channel | null>(null)
  const userRef = useRef<Channel | null>(null)
  const mapRef = useRef<Channel | null>(null)
  const battleRef = useRef<Channel | null>(null)

  // Track current charId for auto-rejoin on reconnect
  const charIdRef = useRef<number>(0)
  const mapIdRef = useRef<number>(0)

  // ── Join lobby channels ────────────────────────────────────────
  const joinLobbies = useCallback((charId?: number) => {
    const socket = getSocket()
    if (!socket) return

    const cid = charId || charIdRef.current

    // game:lobby
    if (!gameRef.current) {
      const ch = socket.channel("game:lobby", cid ? { char_id: cid } : {})
      ch.join()
        .receive("ok", () => {
          gameRef.current = ch
          bump()
        })
        .receive("error", (resp: unknown) =>
          console.error("[phx] game:lobby join error", resp)
        )
      ch.onClose(() => {
        gameRef.current = null
        bump()
      })
    }

    // social:lobby
    if (!socialRef.current) {
      const ch = socket.channel("social:lobby", cid ? { char_id: cid } : {})
      ch.join()
        .receive("ok", () => {
          socialRef.current = ch
          bump()
        })
        .receive("error", (resp: unknown) =>
          console.error("[phx] social:lobby join error", resp)
        )
      ch.onClose(() => {
        socialRef.current = null
        bump()
      })
    }

    // battle:lobby
    if (!battleLobbyRef.current) {
      const ch = socket.channel("battle:lobby", cid ? { char_id: cid } : {})
      ch.join()
        .receive("ok", () => {
          battleLobbyRef.current = ch
          bump()
        })
        .receive("error", (resp: unknown) =>
          console.error("[phx] battle:lobby join error", resp)
        )
      ch.onClose(() => {
        battleLobbyRef.current = null
        bump()
      })
    }
  }, [])

  // ── Connect ────────────────────────────────────────────────────
  const connect = useCallback(
    async (token: string) => {
      storeToken(token)

      await connectSocket({
        token,
        onOpen: () => {
          setIsConnected(true)
          joinLobbies()
          // Rejoin user/map channels if we have IDs (reconnect scenario)
          if (charIdRef.current) {
            joinUserChannelInner(charIdRef.current)
          }
          if (mapIdRef.current) {
            joinMapChannelInner(mapIdRef.current)
          }
        },
        onClose: () => {
          setIsConnected(false)
          // Refs will be nulled by channel onClose callbacks
        },
        onError: () => {},
      })
    },
    [joinLobbies]
  )

  const disconnect = useCallback(() => {
    disconnectSocket()
    clearToken()
    gameRef.current = null
    socialRef.current = null
    battleLobbyRef.current = null
    userRef.current = null
    mapRef.current = null
    battleRef.current = null
    charIdRef.current = 0
    mapIdRef.current = 0
    setIsConnected(false)
    bump()
  }, [])

  // ── Dynamic channel joins ──────────────────────────────────────
  const joinUserChannelInner = useCallback((charId: number) => {
    const socket = getSocket()
    if (!socket) return
    if (userRef.current) {
      userRef.current.leave()
      userRef.current = null
    }
    const ch = socket.channel(`user:${charId}`, {})
    ch.join()
      .receive("ok", () => {
        userRef.current = ch
        bump()
      })
      .receive("error", (resp: unknown) =>
        console.error(`[phx] user:${charId} join error`, resp)
      )
    ch.onClose(() => {
      userRef.current = null
      bump()
    })
  }, [])

  const joinUserChannel = useCallback(
    (charId: number) => {
      charIdRef.current = charId
      joinUserChannelInner(charId)
      // Also re-join lobbies with char_id if not already joined
      joinLobbies(charId)
    },
    [joinUserChannelInner, joinLobbies]
  )

  const joinMapChannelInner = useCallback((mapId: number) => {
    const socket = getSocket()
    if (!socket) return
    if (mapRef.current) {
      mapRef.current.leave()
      mapRef.current = null
    }
    const ch = socket.channel(`map:${mapId}`, { char_id: charIdRef.current })
    ch.join()
      .receive("ok", () => {
        mapRef.current = ch
        bump()
      })
      .receive("error", (resp: unknown) =>
        console.error(`[phx] map:${mapId} join error`, resp)
      )
    ch.onClose(() => {
      mapRef.current = null
      bump()
    })
  }, [])

  const joinMapChannel = useCallback(
    (mapId: number) => {
      mapIdRef.current = mapId
      joinMapChannelInner(mapId)
    },
    [joinMapChannelInner]
  )

  const joinBattleChannel = useCallback((battleId: number): Channel | null => {
    const socket = getSocket()
    if (!socket) return null
    if (battleRef.current) {
      battleRef.current.leave()
      battleRef.current = null
    }
    const ch = socket.channel(`battle:${battleId}`, {
      char_id: charIdRef.current,
    })
    ch.join()
      .receive("ok", (response: unknown) => {
        battleRef.current = ch
        bump()
      })
      .receive("error", (resp: unknown) => {
        console.error(`[phx] battle:${battleId} join error`, resp)
      })
    ch.onClose(() => {
      battleRef.current = null
      bump()
    })
    return ch
  }, [])

  const leaveBattleChannel = useCallback(() => {
    if (battleRef.current) {
      battleRef.current.leave()
      battleRef.current = null
      bump()
    }
  }, [])

  // ── Auto-connect on mount if token exists ──────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return // SSR guard
    const token = getStoredToken()
    if (token) {
      connect(token)
    }
    return () => {
      disconnectSocket()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Context value ──────────────────────────────────────────────
  return (
    <ChannelContext.Provider
      value={{
        isConnected,
        gameChannel: gameRef.current,
        socialChannel: socialRef.current,
        battleLobbyChannel: battleLobbyRef.current,
        userChannel: userRef.current,
        mapChannel: mapRef.current,
        activeBattleChannel: battleRef.current,
        connect,
        disconnect,
        joinUserChannel,
        joinMapChannel,
        joinBattleChannel,
        leaveBattleChannel,
      }}
    >
      {children}
    </ChannelContext.Provider>
  )
}

// ─── Hook ────────────────────────────────────────────────────────
export function useChannels() {
  const ctx = useContext(ChannelContext)
  if (!ctx) {
    throw new Error("useChannels must be used within a <ChannelProvider>")
  }
  return ctx
}
