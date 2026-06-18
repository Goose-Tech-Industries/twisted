// Movement & world interaction actions → game:lobby
import { useCallback, useRef } from "react"
import type { Channel } from "phoenix"

type Dispatch = (action: { type: string; payload?: unknown }) => void
type Notify = (type: string, message: string) => void

export function useMovementActions(
  gameChannel: Channel | null,
  dispatch: Dispatch,
  notify: Notify,
  getState: () => { character: any; currentMap: any },
) {
  const lastMoveRef = useRef(0)
  const isRunningRef = useRef(false)

  const move = useCallback((direction: string) => {
    if (!gameChannel) return
    const { character: char, currentMap: map } = getState()
    if (!char || !map) return

    // Throttle: 250ms walk, 125ms running
    const now = Date.now()
    const cooldown = isRunningRef.current ? 125 : 250
    if (now - lastMoveRef.current < cooldown) return
    lastMoveRef.current = now

    const dx = direction === "right" ? 1 : direction === "left" ? -1 : 0
    const dy = direction === "down" ? 1 : direction === "up" ? -1 : 0
    const newX = char.x + dx
    const newY = char.y + dy

    // Bounds check
    if (newX < 0 || newY < 0 || newX >= (map.width || 20) || newY >= (map.height || 20)) return

    // Passability check
    if (map.tiles) {
      const tileIdx = newY * (map.width || 20) + newX
      const tileId = map.tiles[tileIdx]
      if (tileId === 1) return // Wall
    }

    gameChannel.push("move", { x: newX, y: newY, running: isRunningRef.current })
    dispatch({ type: "SET_CHARACTER", payload: { ...char, x: newX, y: newY } })
  }, [gameChannel, dispatch, getState])

  const moveContinuous = useCallback((tileX: number, tileY: number) => {
    gameChannel?.push("move_continuous", { tileX, tileY, running: isRunningRef.current })
  }, [gameChannel])

  const setRunning = useCallback((running: boolean) => {
    isRunningRef.current = running
  }, [])

  const interact = useCallback(() => {
    const { character: char } = getState()
    if (!char) return
    gameChannel?.push("interact", { x: char.x, y: char.y })
  }, [gameChannel, getState])

  const teleport = useCallback((mapId: number, x: number, y: number) => {
    gameChannel?.push("teleport", { mapId, x, y })
  }, [gameChannel])

  const fastTravel = useCallback((mapId: number) => {
    gameChannel?.push("fast_travel", { mapId })
  }, [gameChannel])

  const enterStructure = useCallback((structureId: number) => {
    gameChannel?.push("enter_structure", { structureId })
  }, [gameChannel])

  const exitStructure = useCallback(() => {
    gameChannel?.push("exit_structure", {})
  }, [gameChannel])

  const eventChoice = useCallback((choiceIndex: number) => {
    gameChannel?.push("event_choice", { choiceIndex })
  }, [gameChannel])

  const triggerCutscene = useCallback((cutsceneId: number) => {
    gameChannel?.push("trigger_cutscene", { cutsceneId })
  }, [gameChannel])

  return {
    move, moveContinuous, setRunning, interact,
    teleport, fastTravel, enterStructure, exitStructure,
    eventChoice, triggerCutscene,
  }
}
