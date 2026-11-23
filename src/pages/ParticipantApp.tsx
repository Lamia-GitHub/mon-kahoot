import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import HomeLayout from '../components/HomeLayout'
import PlayerGame from '../components/PlayerGame'
import PlayerHome from '../components/PlayerHome'
import PlayerLobby, { KICKED_MESSAGE } from '../components/PlayerLobby'
import { playerStorage } from '../lib/gameStorage'
import { supabase } from '../lib/supabase'
import type { GameSession, Player } from '../types/database'

type View =
  | { name: 'restoring' }
  | { name: 'home'; notice?: string }
  | { name: 'lobby'; player: Player; session: GameSession }
  | { name: 'game'; player: Player; session: GameSession }

// Interface Participant (URL principale) : rejoindre, attendre, jouer.
// La partie en cours est mémorisée dans l'onglet : un rafraîchissement y ramène directement.
export default function ParticipantApp() {
  const [view, setView] = useState<View>(() => (playerStorage.load() ? { name: 'restoring' } : { name: 'home' }))

  // Quitter / partie terminée / joueur éjecté : on oublie la partie mémorisée
  const goHome = (notice?: string) => {
    playerStorage.clear()
    setView({ name: 'home', notice })
  }

  // Reconnexion automatique après un rafraîchissement
  useEffect(() => {
    const stored = playerStorage.load()
    if (!stored) return
    let cancelled = false
    void (async () => {
      const [sessionRes, playerRes] = await Promise.all([
        supabase.from('game_sessions').select('*').eq('id', stored.gameSessionId).maybeSingle(),
        supabase.from('players').select('*').eq('id', stored.playerId).maybeSingle(),
      ])
      if (cancelled) return
      if (sessionRes.error || playerRes.error) {
        // Réseau indisponible : on garde la mémorisation pour réessayer au prochain chargement
        setView({ name: 'home', notice: 'Connexion impossible pour reprendre ta partie. Actualise la page pour réessayer.' })
        return
      }
      const session = sessionRes.data
      const player = playerRes.data
      if (!session || session.status === 'finished') return goHome()
      if (!player) return goHome(KICKED_MESSAGE)
      setView(session.status === 'lobby' ? { name: 'lobby', player, session } : { name: 'game', player, session })
    })()
    return () => {
      cancelled = true
    }
  }, [])

  switch (view.name) {
    case 'restoring':
      return (
        <HomeLayout subtitle="Le quiz en temps réel">
          <p className="flex items-center gap-2 text-lg font-bold text-white">
            <Loader2 className="h-6 w-6 animate-spin" /> Reconnexion à ta partie…
          </p>
        </HomeLayout>
      )
    case 'lobby':
      return (
        <PlayerLobby
          player={view.player}
          session={view.session}
          onLeave={goHome}
          onStarted={(session) => setView({ name: 'game', player: view.player, session })}
        />
      )
    case 'game':
      return <PlayerGame player={view.player} session={view.session} onLeave={() => goHome()} />
    case 'home':
      return (
        <PlayerHome
          notice={view.notice}
          onJoined={(player, session) => {
            playerStorage.save({ gameSessionId: session.id, playerId: player.id, nickname: player.nickname })
            setView({ name: 'lobby', player, session })
          }}
        />
      )
  }
}
