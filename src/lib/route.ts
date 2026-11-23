import { useEffect, useState } from 'react'

// Routage minimal par le fragment d'URL (#…) : compatible hébergement statique (GitHub Pages),
// aucune requête serveur n'est faite quand le fragment change.
//   /           → interface Participant
//   /#/admin    → interface Animateur (protégée par VITE_ADMIN_PIN)

export type AppRoute = 'participant' | 'admin'

export const ADMIN_HASH = '#/admin'

function parseRoute(hash: string): AppRoute {
  return /^#\/admin\/?$/i.test(hash) ? 'admin' : 'participant'
}

export function useHashRoute(): AppRoute {
  const [route, setRoute] = useState<AppRoute>(() => parseRoute(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function goToParticipant() {
  window.location.hash = '/'
}

// Adresse publique des participants : l'URL du site sans fragment (#/admin…) ni paramètres
export function participantUrl(): string {
  return `${window.location.origin}${window.location.pathname}`
}
