// Character actions → game:lobby (respawn, AP, equip, abilities, items)
import { useCallback } from "react"
import type { Channel } from "phoenix"

export function useCharacterActions(gameChannel: Channel | null) {
  const requestRespawn = useCallback(() => {
    gameChannel?.push("request_respawn", {})
  }, [gameChannel])

  const restAtInn = useCallback(() => {
    gameChannel?.push("rest_at_inn", {})
  }, [gameChannel])

  const distributeAp = useCallback((stat: string, points: number) => {
    gameChannel?.push("distribute_ap", { stat, points })
  }, [gameChannel])

  const useAbility = useCallback((abilityType: string) => {
    gameChannel?.push("use_ability", { abilityType })
  }, [gameChannel])

  const getAbilities = useCallback(() => {
    gameChannel?.push("get_abilities", {})
  }, [gameChannel])

  const useCapsule = useCallback((itemId: number) => {
    gameChannel?.push("use_capsule", { itemId })
  }, [gameChannel])

  const dropItem = useCallback((itemId: number, quantity: number) => {
    gameChannel?.push("drop_item", { itemId, quantity })
  }, [gameChannel])

  const pickupItem = useCallback((groundItemId: number) => {
    gameChannel?.push("pickup_item", { groundItemId })
  }, [gameChannel])

  const getGroundItems = useCallback(() => {
    gameChannel?.push("get_ground_items", {})
  }, [gameChannel])

  const tutorialComplete = useCallback(() => {
    gameChannel?.push("tutorial_complete", {})
  }, [gameChannel])

  const selectCharacter = useCallback((charId: number) => {
    gameChannel?.push("select_character", { charId })
  }, [gameChannel])

  return {
    requestRespawn, restAtInn, distributeAp,
    useAbility, getAbilities, useCapsule,
    dropItem, pickupItem, getGroundItems,
    tutorialComplete, selectCharacter,
  }
}
