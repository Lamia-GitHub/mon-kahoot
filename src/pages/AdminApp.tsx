import { useState } from 'react'
import AdminHome from '../components/AdminHome'
import AdminPinDialog from '../components/AdminPinDialog'
import CreateQuiz from '../components/CreateQuiz'
import HomeLayout from '../components/HomeLayout'
import HostGame from '../components/HostGame'
import HostLobby from '../components/HostLobby'
import StatsDashboard from '../components/StatsDashboard'
import { isAdminUnlocked } from '../lib/adminAuth'
import { goToParticipant } from '../lib/route'
import type { GameSession } from '../types/database'

type View =
  | { name: 'home' }
  | { name: 'create' }
  | { name: 'edit'; quizId: string }
  | { name: 'stats' }
  | { name: 'host-lobby'; session: GameSession; quizTitle: string }
  | { name: 'host-game'; session: GameSession; quizTitle: string }

// Interface Animateur (#/admin) : le code secret est demandé à l'ouverture
// (une fois par onglet), puis chaque écran interne revient à l'espace animateur.
export default function AdminApp() {
  const [unlocked, setUnlocked] = useState(isAdminUnlocked)
  const [view, setView] = useState<View>({ name: 'home' })
  const goHome = () => setView({ name: 'home' })

  if (!unlocked) {
    return (
      <HomeLayout subtitle="Espace animateur">
        {/* Annuler ramène à la page participant */}
        <AdminPinDialog onSuccess={() => setUnlocked(true)} onCancel={goToParticipant} />
      </HomeLayout>
    )
  }

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
    case 'home':
      return (
        <AdminHome
          onCreateQuiz={() => setView({ name: 'create' })}
          onOpenStats={() => setView({ name: 'stats' })}
          onLaunched={(session, quizTitle) => setView({ name: 'host-lobby', session, quizTitle })}
          onEditQuiz={(quizId) => setView({ name: 'edit', quizId })}
        />
      )
  }
}
