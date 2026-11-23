// Mémorisation de la partie en cours dans sessionStorage (propre à l'onglet) :
// un rafraîchissement de page ou un smartphone déverrouillé reprend la partie là où elle en était.

const PLAYER_KEY = 'mon-kahoot:player'
const HOST_KEY = 'mon-kahoot:host'

export interface StoredPlayer {
  gameSessionId: string
  playerId: string
  nickname: string
}

export interface StoredHost {
  hostGameSessionId: string
  quizTitle: string
  // Décalage mesuré entre l'horloge de ce PC et celle de Supabase (ms) : sert à recaler
  // le chronomètre après un rafraîchissement
  clockOffsetMs?: number
}

function read(key: string): Record<string, unknown> | null {
  try {
    const raw = sessionStorage.getItem(key)
    const value: unknown = raw ? JSON.parse(raw) : null
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
  } catch {
    return null // stockage indisponible ou contenu illisible : on repart de zéro
  }
}

function write(key: string, value: object) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // navigation privée stricte : pas de reconnexion automatique, le jeu fonctionne quand même
  }
}

function remove(key: string) {
  try {
    sessionStorage.removeItem(key)
  } catch {
    // ignoré
  }
}

export const playerStorage = {
  load(): StoredPlayer | null {
    const v = read(PLAYER_KEY)
    return v && typeof v.gameSessionId === 'string' && typeof v.playerId === 'string' && typeof v.nickname === 'string'
      ? { gameSessionId: v.gameSessionId, playerId: v.playerId, nickname: v.nickname }
      : null
  },
  save(value: StoredPlayer) {
    write(PLAYER_KEY, value)
  },
  clear() {
    remove(PLAYER_KEY)
  },
}

export const hostStorage = {
  load(): StoredHost | null {
    const v = read(HOST_KEY)
    return v && typeof v.hostGameSessionId === 'string' && typeof v.quizTitle === 'string'
      ? {
          hostGameSessionId: v.hostGameSessionId,
          quizTitle: v.quizTitle,
          clockOffsetMs: typeof v.clockOffsetMs === 'number' ? v.clockOffsetMs : undefined,
        }
      : null
  },
  save(value: StoredHost) {
    write(HOST_KEY, value)
  },
  setClockOffset(clockOffsetMs: number) {
    const current = hostStorage.load()
    if (current) write(HOST_KEY, { ...current, clockOffsetMs })
  },
  clear() {
    remove(HOST_KEY)
  },
}

// Appelle `onVisible` quand l'onglet redevient visible (smartphone déverrouillé, retour sur l'onglet)
export function onPageVisible(onVisible: () => void): () => void {
  const handler = () => {
    if (document.visibilityState === 'visible') onVisible()
  }
  document.addEventListener('visibilitychange', handler)
  window.addEventListener('pageshow', handler)
  return () => {
    document.removeEventListener('visibilitychange', handler)
    window.removeEventListener('pageshow', handler)
  }
}
