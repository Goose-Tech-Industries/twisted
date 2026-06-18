// Minigame actions → social:lobby (minigame_handler)
import { useCallback } from "react"
import type { Channel } from "phoenix"

export function useMinigameActions(socialChannel: Channel | null) {
  const fishCast = useCallback((spotId?: number) => {
    socialChannel?.push("fish_cast", { spotId })
  }, [socialChannel])

  const fishReel = useCallback(() => {
    socialChannel?.push("fish_reel", {})
  }, [socialChannel])

  const diceRoll = useCallback((bet: number, prediction: string) => {
    socialChannel?.push("dice_roll", { bet, prediction })
  }, [socialChannel])

  const cardGameChallenge = useCallback((npcId: number) => {
    socialChannel?.push("card_game_challenge", { npcId })
  }, [socialChannel])

  const cardGamePlace = useCallback((cardId: number, position: number) => {
    socialChannel?.push("card_game_place", { cardId, position })
  }, [socialChannel])

  return {
    fishCast, fishReel, diceRoll, cardGameChallenge, cardGamePlace,
  }
}
