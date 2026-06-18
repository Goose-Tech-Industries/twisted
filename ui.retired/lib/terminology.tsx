"use client"

import React, { createContext, useContext, useState, useEffect } from "react"

// Default game terms that can be overridden by admins
const DEFAULT_TERMS: Record<string, string> = {
  oghams: 'Oghams',
  gil: 'Gold',
  ki: 'Ki',
  mp: 'MP',
  hp: 'HP',
  xp: 'XP',
  atk: 'ATK',
  def: 'DEF',
  mo: 'Magic Offense',
  md: 'Magic Defense',
  speed: 'Speed',
  luck: 'Luck',
  world: 'World',
  region: 'Region',
  map: 'Map',
  quest: 'Quest',
  inn: 'Inn',
  battle: 'Battle',
  arena: 'Arena',
  tournament: 'Tournament',
  guild: 'Guild',
  party: 'Party',
  companion: 'Companion',
  mount: 'Mount',
  creature: 'Creature',
  bounty: 'Bounty',
  gathering: 'Gathering',
  crafting: 'Crafting',
  housing: 'Housing',
  bank: 'Bank',
  shop: 'Shop',
  npc: 'NPC',
  level: 'Level',
  class: 'Class',
  race: 'Race',
  alignment: 'Alignment',
  reputation: 'Reputation',
  signature_tech: 'Signature Technique',
  fighting_style: 'Fighting Style',
  limit_break: 'Limit Break',
}

interface TerminologyContextValue {
  terms: Record<string, string>
  t: (key: string) => string
  setTerms: (terms: Record<string, string>) => void
}

const TerminologyContext = createContext<TerminologyContextValue>({
  terms: DEFAULT_TERMS,
  t: (key: string) => DEFAULT_TERMS[key] || key,
  setTerms: () => {},
})

export function TerminologyProvider({ children }: { children: React.ReactNode }) {
  const [terms, setTermsState] = useState<Record<string, string>>(DEFAULT_TERMS)

  useEffect(() => {
    const API = process.env.NEXT_PUBLIC_API_URL || ''
    fetch(`${API}/admin-panel/terminology`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.success && d.terms) {
          setTermsState(prev => ({ ...prev, ...d.terms }))
        }
      })
      .catch(() => {})
  }, [])

  const t = (key: string) => terms[key] || DEFAULT_TERMS[key] || key
  const setTerms = (newTerms: Record<string, string>) => {
    setTermsState(prev => ({ ...prev, ...newTerms }))
  }

  return (
    <TerminologyContext.Provider value={{ terms, t, setTerms }}>
      {children}
    </TerminologyContext.Provider>
  )
}

export function useTerminology() {
  return useContext(TerminologyContext)
}
