import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import AdminHome from '../components/AdminHome'
import AdminPinDialog from '../components/AdminPinDialog'
import CreateQuiz from '../components/CreateQuiz'
import HomeLayout from '../components/HomeLayout'
import HostGame from '../components/HostGame'
import HostLobby from '../components/HostLobby'
import StatsDashboard from '../components/StatsDashboard'
import { isAdminUnlocked } from '../lib/adminAuth'
import { hostStorage } from '../lib/gameStorage'
import { goToParticipant } from '../lib/route'
import { supabase } from '../lib/supabase'
import type { GameSession } from '../types/database'

type View =
  | { name: 'restoring' }
  | { name: 'home' }
  | { name: 'create' }
  | { name: 'edit'; quizId: string }
  | { name: 'stats' }
  | { name: 'host-lobby'; session: GameSession; quizTitle: string }
  | { name: 'host-game'; session: GameSession; quizTitle: string; resumed: boolean }

// Interface Animateur (#/admin) : le code secret est demandé à l'ouverture
// (une fois par onglet), puis chaque écran interne revient à l'espace animateur.
// La partie animée est mémorisée dans l'onglet : un rafraîchissement y ramène.
export default function AdminApp() {
  const [unlocked, setUnlocked] = useState(isAdminUnlocked)
  const [view, setView] = useState<View>(() => (hostStorage.load() ? { name: 'restoring' } : { name: 'home' }))

  // Retour à l'espace animateur : aucune partie n'est plus en cours d'animation dans cet onglet
  const goHome = () => {
    hostStorage.clear()
    setView({ name: 'home' })
  }

  // Reprise de la partie animée après un rafraîchissement (une fois le code saisi)
  useEffect(() => {
    if (!unlocked) return
    const stored = hostStorage.load()
    if (!stored) return
    let cancelled = false
    void (async () => {
      const { data: session, error } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('id', stored.hostGameSessionId)
        .maybeSingle()
      if (cancelled) return
      if (error) return setView({ name: 'home' }) // réseau : mémorisation conservée pour réessayer
      if (!session || session.status === 'finished') {
        hostStorage.clear()
        return setView({ name: 'home' })
      }
      setView(
        session.status === 'lobby'
          ? { name: 'host-lobby', session, quizTitle: stored.quizTitle }
          : { name: 'host-game', session, quizTitle: stored.quizTitle, resumed: true },
      )
    })()
    return () => {
      cancelled = true
    }
  }, [unlocked])

  if (!unlocked) {
    return (
      <HomeLayout subtitle="Espace hôte">
        {/* Annuler ramène à la page participant */}
        <AdminPinDialog onSuccess={() => setUnlocked(true)} onCancel={goToParticipant} />
      </HomeLayout>
    )
  }

  switch (view.name) {
    case 'restoring':
      return (
        <HomeLayout subtitle="Espace hôte">
          <p className="flex items-center gap-2 text-lg font-bold text-white">
            <Loader2 className="h-6 w-6 animate-spin" /> Reprise de la partie en cours…
          </p>
        </HomeLayout>
      )
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
          onStarted={(session) => setView({ name: 'host-game', session, quizTitle: view.quizTitle, resumed: false })}
        />
      )
    case 'host-game':
      return <HostGame session={view.session} quizTitle={view.quizTitle} resumed={view.resumed} onExit={goHome} />
    case 'home':
      return (
        <AdminHome
          onCreateQuiz={() => setView({ name: 'create' })}
          onOpenStats={() => setView({ name: 'stats' })}
          onLaunched={(session, quizTitle) => {
            hostStorage.save({ hostGameSessionId: session.id, quizTitle })
            setView({ name: 'host-lobby', session, quizTitle })
          }}
          onEditQuiz={(quizId) => setView({ name: 'edit', quizId })}
        />
      )
  }
}
