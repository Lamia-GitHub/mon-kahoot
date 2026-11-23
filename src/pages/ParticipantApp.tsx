import { useState } from 'react'
import PlayerGame from '../components/PlayerGame'
import PlayerHome from '../components/PlayerHome'
import PlayerLobby from '../components/PlayerLobby'
import type { GameSession, Player } from '../types/database'

type View =
  | { name: 'home' }
  | { name: 'lobby'; player: Player; session: GameSession }
  | { name: 'game'; player: Player; session: GameSession }

// Interface Participant (URL principale) : rejoindre, attendre, jouer
export default function ParticipantApp() {
  const [view, setView] = useState<View>({ name: 'home' })
  const goHome = () => setView({ name: 'home' })

  switch (view.name) {
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
      return <PlayerGame player={view.player} session={view.session} onLeave={goHome} />
    case 'home':
      return <PlayerHome onJoined={(player, session) => setView({ name: 'lobby', player, session })} />
  }
}
