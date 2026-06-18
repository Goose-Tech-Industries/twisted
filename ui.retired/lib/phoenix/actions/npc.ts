// NPC & companion actions → game:lobby (npc_handler)
import { useCallback } from "react"
import type { Channel } from "phoenix"

export function useNpcActions(gameChannel: Channel | null) {
  const npcTalk = useCallback((npcId: number) => {
    gameChannel?.push("npc_talk", { npcId })
  }, [gameChannel])

  const npcMenuChoice = useCallback((choiceId: string) => {
    gameChannel?.push("npc_menu_choice", { choiceId })
  }, [gameChannel])

  const acceptNpcNeed = useCallback((npcId: number) => {
    gameChannel?.push("accept_npc_need", { npcId })
  }, [gameChannel])

  const npcGetRelationships = useCallback((npcId: number) => {
    gameChannel?.push("npc_get_relationships", { npcId })
  }, [gameChannel])

  // Training
  const masterTrain = useCallback((npcId: number) => {
    gameChannel?.push("master_train", { npcId })
  }, [gameChannel])

  const train = useCallback((trainingType: string) => {
    gameChannel?.push("train", { trainingType })
  }, [gameChannel])

  // Companions
  const companionSetTactics = useCallback((npcId: number, tactics: string) => {
    gameChannel?.push("companion_set_tactics", { npcId, tactics })
  }, [gameChannel])

  const companionDismiss = useCallback((npcId: number) => {
    gameChannel?.push("companion_dismiss", { npcId })
  }, [gameChannel])

  const companionGetAffinity = useCallback((npcId: number) => {
    gameChannel?.push("companion_get_affinity", { npcId })
  }, [gameChannel])

  const companionQuestAccept = useCallback((npcId: number, questId: number) => {
    gameChannel?.push("companion_quest_accept", { npcId, questId })
  }, [gameChannel])

  return {
    npcTalk, npcMenuChoice, acceptNpcNeed, npcGetRelationships,
    masterTrain, train,
    companionSetTactics, companionDismiss, companionGetAffinity, companionQuestAccept,
  }
}
