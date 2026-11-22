import { useState } from 'react'
import CreateQuiz from './components/CreateQuiz'
import HomePage from './components/HomePage'
import HostGame from './components/HostGame'
import HostLobby from './components/HostLobby'
import PlayerGame from './components/PlayerGame'
import PlayerLobby from './components/PlayerLobby'
import StatsDashboard from './components/StatsDashboard'
import type { GameSession, Player } from './types/database'

type View =
  | { name: 'home' }
  | { name: 'create' }
  | { name: 'edit'; quizId: string }
  | { name: 'stats' }
  | { name: 'host-lobby'; session: GameSession; quizTitle: string }
  | { name: 'host-game'; session: GameSession; quizTitle: string }
  | { name: 'player-lobby'; player: Player; session: GameSession }
  | { name: 'player-game'; player: Player; session: GameSession }

export default function App() {
  const [view, setView] = useState<View>({ name: 'home' })
  const goHome = () => setView({ name: 'home' })

  switch (view.name) {
    case 'create':
      return <CreateQuiz onBack={goHome} />
    case 'edit':
      // key : remonte l'éditeur si on ouvre un autre quiz
      return <CreateQuiz key={view.quizId} quizId={view.quizId} onBack={goHome} />
    case 'stats':
      return <StatsDashboard onBack={goHome} />
    case 'host-lobby':
      return (
        <HostLobby
          session={view.session}
          quizTitle={view.quizTitle}
          onExit={goHome}
          onStarted={(session) => setView({ name: 'host-game', session, quizTitle: view.quizTitle })}
        />
      )
    case 'host-game':
      return <HostGame session={view.session} quizTitle={view.quizTitle} onExit={goHome} />
    case 'player-lobby':
      return (
        <PlayerLobby
          player={view.player}
          session={view.session}
          onLeave={goHome}
          onStarted={(session) => setView({ name: 'player-game', player: view.player, session })}
        />
      )
    case 'player-game':
      return <PlayerGame player={view.player} session={view.session} onLeave={goHome} />
    case 'home':
      return (
        <HomePage
          onCreateQuiz={() => setView({ name: 'create' })}
          onOpenStats={() => setView({ name: 'stats' })}
          onLaunched={(session, quizTitle) => setView({ name: 'host-lobby', session, quizTitle })}
          onEditQuiz={(quizId) => setView({ name: 'edit', quizId })}
          onJoined={(player, session) => setView({ name: 'player-lobby', player, session })}
        />
      )
  }
}
