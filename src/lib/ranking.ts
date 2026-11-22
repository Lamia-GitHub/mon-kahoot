import type { Player } from '../types/database'

// Classement par score décroissant (à égalité : ordre d'arrivée)
export function sortByScore(players: Player[]): Player[] {
  return [...players].sort((a, b) => b.score - a.score || a.joined_at.localeCompare(b.joined_at))
}

// Position d'un joueur (1 = premier). Les ex-aequo partagent la même position.
export function rankOf(players: Player[], playerId: string): number | null {
  const me = players.find((p) => p.id === playerId)
  if (!me) return null
  return 1 + players.filter((p) => p.score > me.score).length
}

export function ordinal(rank: number): string {
  return rank === 1 ? '1er' : `${rank}e`
}
