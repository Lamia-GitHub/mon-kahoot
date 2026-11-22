import { useState, type FormEvent } from 'react'
import { AlertTriangle, BarChart3, Gamepad2, Loader2, PlusCircle, Sparkles } from 'lucide-react'
import { ANSWER_STYLES } from '../lib/answerStyles'
import { supabase } from '../lib/supabase'
import type { GameSession, Player } from '../types/database'
import QuizList from './QuizList'
import AdminPinDialog from './AdminPinDialog'
import { isAdminUnlocked } from '../lib/adminAuth'

interface HomePageProps {
  onCreateQuiz: () => void
  onOpenStats: () => void
  onLaunched: (session: GameSession, quizTitle: string) => void
  onEditQuiz: (quizId: string) => void
  onJoined: (player: Player, session: GameSession) => void
}

export default function HomePage({ onCreateQuiz, onOpenStats, onLaunched, onEditQuiz, onJoined }: HomePageProps) {
  const [pin, setPin] = useState('')
  const [nickname, setNickname] = useState('')
  const [joinError, setJoinError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  // Action animateur en attente de la saisie du code secret
  const [pendingAdminAction, setPendingAdminAction] = useState<(() => void) | null>(null)

  // Exécute une action animateur : directement si le code a déjà été saisi dans cet onglet,
  // sinon après la saisie du code. Les joueurs (Rejoindre) ne passent jamais par ici.
  function requireAdmin(action: () => void) {
    if (isAdminUnlocked()) action()
    else setPendingAdminAction(() => action)
  }

  const pinValid = /^\d{6}$/.test(pin)
  const nicknameValid = nickname.trim().length >= 1 && nickname.trim().length <= 30
  const canJoin = pinValid && nicknameValid && !joining

  async function handleJoin(e: FormEvent) {
    e.preventDefault()
    if (!canJoin) return
    setJoining(true)
    setJoinError(null)

    try {
      // 1. Retrouver la partie (le PIN n'est unique que parmi les parties non terminées)
      const { data: session, error: sessionError } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('pin', pin)
        .neq('status', 'finished')
        .maybeSingle()

      if (sessionError) {
        setJoinError(`Erreur Supabase : ${sessionError.message}`)
        return
      }
      if (!session) {
        setJoinError(`Aucune partie en cours avec le code ${pin}. Vérifie le PIN.`)
        return
      }
      if (session.status !== 'lobby') {
        setJoinError('Cette partie a déjà commencé, impossible de la rejoindre.')
        return
      }

      // 2. S'inscrire comme joueur
      const { data: player, error: playerError } = await supabase
        .from('players')
        .insert({ session_id: session.id, nickname: nickname.trim() })
        .select('*')
        .single()

      if (playerError) {
        setJoinError(
          playerError.code === '23505'
            ? `Le pseudo « ${nickname.trim()} » est déjà pris dans cette partie. Choisis-en un autre.`
            : `Impossible de rejoindre la partie : ${playerError.message}`,
        )
        return
      }

      onJoined(player, session)
    } finally {
      setJoining(false)
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-violet-800 via-purple-700 to-fuchsia-600 px-4 py-10">
      {/* Formes décoratives */}
      <div className="pointer-events-none absolute inset-0 opacity-20">
        {ANSWER_STYLES.map(({ icon: Icon, label }, i) => (
          <Icon
            key={label}
            className={[
              'absolute h-32 w-32 text-white',
              ['left-[5%] top-[8%] rotate-12', 'right-[8%] top-[15%] -rotate-12', 'left-[10%] top-[70%]', 'right-[5%] top-[85%] rotate-45'][i],
            ].join(' ')}
            strokeWidth={1.5}
          />
        ))}
      </div>

      <div className="relative mx-auto flex max-w-md flex-col items-center gap-8">
        <header className="text-center text-white">
          <h1 className="flex items-center justify-center gap-2 text-5xl font-black tracking-tight drop-shadow-lg">
            <Sparkles className="h-10 w-10 text-amber-300" />
            Mon Kahoot
          </h1>
          <p className="mt-2 text-lg font-medium text-white/85">Le quiz en temps réel</p>
        </header>

        {/* Rejoindre une partie */}
        <form
          onSubmit={(e) => void handleJoin(e)}
          className="w-full space-y-4 rounded-3xl bg-white p-6 shadow-2xl"
        >
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-gray-800">
            <Gamepad2 className="h-6 w-6 text-violet-600" />
            Rejoindre une partie
          </h2>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-600">Code PIN</span>
            <input
              inputMode="numeric"
              autoComplete="off"
              placeholder="123456"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                setJoinError(null)
              }}
              className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-center text-3xl font-black tracking-[0.4em] text-gray-800 placeholder:text-gray-300 focus:border-violet-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-600">Pseudo</span>
            <input
              maxLength={30}
              placeholder="Ton pseudo"
              value={nickname}
              onChange={(e) => {
                setNickname(e.target.value)
                setJoinError(null)
              }}
              className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-lg font-semibold text-gray-800 placeholder:text-gray-400 focus:border-violet-500 focus:outline-none"
            />
          </label>

          <button
            type="submit"
            disabled={!canJoin}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 py-3 text-lg font-extrabold text-white shadow-[0_4px_0_0_rgba(0,0,0,0.35)] transition hover:bg-gray-800 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-40"
          >
            {joining && <Loader2 className="h-5 w-5 animate-spin" />}
            Entrer
          </button>

          {joinError && (
            <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {joinError}
            </p>
          )}
        </form>

        <div className="flex w-full items-center gap-3 text-white/70">
          <div className="h-px flex-1 bg-white/30" />
          <span className="text-sm font-semibold uppercase tracking-wider">ou</span>
          <div className="h-px flex-1 bg-white/30" />
        </div>

        {/* Créer un quiz */}
        <button
          type="button"
          onClick={() => requireAdmin(onCreateQuiz)}
          className="flex w-full items-center justify-center gap-3 rounded-3xl bg-amber-400 px-6 py-5 text-xl font-black text-gray-900 shadow-[0_6px_0_0_rgba(0,0,0,0.25)] transition hover:bg-amber-300 active:translate-y-1 active:shadow-none"
        >
          <PlusCircle className="h-7 w-7" />
          Créer un quiz
        </button>

        {/* Statistiques (espace animateur) */}
        <button
          type="button"
          onClick={() => requireAdmin(onOpenStats)}
          className="-mt-4 flex w-full items-center justify-center gap-3 rounded-2xl bg-white/15 px-6 py-3 text-lg font-extrabold text-white ring-2 ring-white/40 transition hover:bg-white/25"
        >
          <BarChart3 className="h-6 w-6" />
          Statistiques
        </button>

        {/* Mes Quiz */}
        <QuizList onLaunched={onLaunched} onEdit={onEditQuiz} requireAdmin={requireAdmin} />
      </div>

      {pendingAdminAction && (
        <AdminPinDialog
          onCancel={() => setPendingAdminAction(null)}
          onSuccess={() => {
            const action = pendingAdminAction
            setPendingAdminAction(null)
            action()
          }}
        />
      )}
    </main>
  )
}
