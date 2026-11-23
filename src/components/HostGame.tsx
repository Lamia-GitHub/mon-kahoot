import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Crown,
  Home,
  Lightbulb,
  Loader2,
  MessageSquareText,
  SkipForward,
  Trophy,
  Users,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { supabaseErrorDetails } from '../lib/errors'
import { ANSWER_STYLES, visibleChoices } from '../lib/answerStyles'
import { sortByScore } from '../lib/ranking'
import type { Answer, GameSession, Player, Question } from '../types/database'

interface HostGameProps {
  session: GameSession
  quizTitle: string
  onExit: () => void
}

export default function HostGame({ session: initialSession, quizTitle, onExit }: HostGameProps) {
  const [session, setSession] = useState(initialSession)
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [answers, setAnswers] = useState<Answer[]>([])
  // Heure locale d'affichage de la question : le chrono ne dépend pas du décalage d'horloge
  // avec le serveur (Supabase fixe sa propre heure de début pour le calcul des points).
  const [shownAt, setShownAt] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const closingIndexRef = useRef<number | null>(null)

  const index = session.current_question_index
  const question = questions?.[index] ?? null
  const isLast = questions !== null && index >= questions.length - 1

  const currentAnswers = useMemo(
    () => (question ? answers.filter((a) => a.question_id === question.id) : []),
    [answers, question],
  )
  const ranking = useMemo(() => sortByScore(players), [players])

  const refreshPlayers = useCallback(async () => {
    const { data, error } = await supabase.from('players').select('*').eq('session_id', session.id)
    if (error) setError(['Impossible de charger les scores.', ...supabaseErrorDetails(error)])
    else setPlayers(data)
  }, [session.id])

  // Chargement des questions et des joueurs
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase
        .from('questions')
        .select('*')
        .eq('quiz_id', session.quiz_id)
        .is('archived_at', null)
        .order('position')
      if (cancelled) return
      if (error) setError(['Impossible de charger les questions.', ...supabaseErrorDetails(error)])
      else setQuestions(data)
    })()
    void refreshPlayers()
    return () => {
      cancelled = true
    }
  }, [session.quiz_id, refreshPlayers])

  // Réponses reçues en direct
  useEffect(() => {
    let cancelled = false
    const addAnswers = (incoming: Answer[]) =>
      setAnswers((as) => {
        const known = new Set(as.map((a) => a.id))
        return [...as, ...incoming.filter((a) => !known.has(a.id))]
      })

    const channel = supabase
      .channel(`host-game-${session.id}-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'answers', filter: `session_id=eq.${session.id}` },
        (payload) => addAnswers([payload.new as Answer]),
      )
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED' || cancelled) return
        // Rattrape les réponses arrivées avant l'abonnement
        const { data } = await supabase.from('answers').select('*').eq('session_id', session.id)
        if (!cancelled && data) addAnswers(data)
      })

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [session.id])

  // Tic-tac du chronomètre
  useEffect(() => {
    if (session.status !== 'question') return
    const timer = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(timer)
  }, [session.status])

  const remainingMs = question ? Math.max(0, shownAt + question.time_limit * 1000 - now) : 0
  const secondsLeft = Math.ceil(remainingMs / 1000)

  const closeQuestion = useCallback(async () => {
    // Une seule clôture par question, même si plusieurs conditions se déclenchent
    if (closingIndexRef.current === index) return
    closingIndexRef.current = index
    setBusy(true)
    const { data, error } = await supabase
      .from('game_sessions')
      .update({ status: 'results' })
      .eq('id', session.id)
      .select('*')
      .single()
    if (error) {
      closingIndexRef.current = null
      setError(['Impossible d’afficher les résultats.', ...supabaseErrorDetails(error)])
    } else {
      setSession(data)
      await refreshPlayers() // les scores sont mis à jour par Supabase à chaque réponse
    }
    setBusy(false)
  }, [index, session.id, refreshPlayers])

  // Passage automatique aux résultats : chrono à zéro OU tout le monde a répondu
  useEffect(() => {
    if (session.status !== 'question' || !question) return
    const allAnswered = players.length > 0 && currentAnswers.length >= players.length
    if (remainingMs <= 0 || allAnswered) void closeQuestion()
  }, [session.status, question, remainingMs, players.length, currentAnswers.length, closeQuestion])

  async function goToNextQuestion() {
    setBusy(true)
    setError(null)
    // Le trigger Supabase enregistre l'heure exacte de début de la nouvelle question
    const { data, error } = await supabase
      .from('game_sessions')
      .update({ status: 'question', current_question_index: index + 1 })
      .eq('id', session.id)
      .select('*')
      .single()
    setBusy(false)
    if (error) {
      setError(['Impossible de passer à la question suivante.', ...supabaseErrorDetails(error)])
      return
    }
    setShownAt(Date.now())
    setNow(Date.now())
    setSession(data)
  }

  async function finishGame() {
    setBusy(true)
    setError(null)
    const { data, error } = await supabase
      .from('game_sessions')
      .update({ status: 'finished', ended_at: new Date().toISOString() })
      .eq('id', session.id)
      .select('*')
      .single()
    if (error) {
      setError(['Impossible de terminer la partie.', ...supabaseErrorDetails(error)])
    } else {
      await refreshPlayers()
      setSession(data)
    }
    setBusy(false)
  }

  const errorBox = error && (
    <div role="alert" className="mx-auto w-full max-w-5xl rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
      <p className="flex items-center gap-2 font-bold">
        <AlertTriangle className="h-4 w-4" />
        {error[0]}
      </p>
      {error.length > 1 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-6">
          {error.slice(1).map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  )

  if (!questions) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gradient-to-br from-violet-800 via-purple-700 to-fuchsia-600 p-6 text-white">
        {errorBox ?? <Loader2 className="h-12 w-12 animate-spin" />}
      </main>
    )
  }

  // ------------------------------------------------------------------ Podium final
  if (session.status === 'finished') {
    const podium = ranking.slice(0, 3)
    // Ordre d'affichage : 2e, 1er, 3e
    const slots = [
      { player: podium[1], place: 2, height: 'h-40', color: 'bg-slate-300 text-slate-800' },
      { player: podium[0], place: 1, height: 'h-56', color: 'bg-amber-400 text-amber-950' },
      { player: podium[2], place: 3, height: 'h-28', color: 'bg-orange-400 text-orange-950' },
    ]
    return (
      <main className="flex min-h-screen flex-col items-center gap-8 bg-gradient-to-br from-violet-800 via-purple-700 to-fuchsia-600 px-4 py-10 text-white">
        <div className="text-center">
          <p className="text-lg font-semibold text-white/80">{quizTitle}</p>
          <h1 className="flex items-center gap-3 text-5xl font-black">
            <Trophy className="h-12 w-12 text-amber-300" />
            Podium
          </h1>
        </div>

        <div className="flex w-full max-w-3xl items-end justify-center gap-3 sm:gap-6">
          {slots.map(({ player, place, height, color }) => (
            <div key={place} className="flex w-1/3 max-w-52 flex-col items-center gap-2">
              {player ? (
                <>
                  {place === 1 && <Crown className="h-10 w-10 text-amber-300" />}
                  <p className="w-full truncate text-center text-xl font-black sm:text-2xl">{player.nickname}</p>
                  <p className="font-bold text-white/85">{player.score} pts</p>
                </>
              ) : (
                <p className="text-white/50">—</p>
              )}
              <div
                className={`flex w-full ${height} items-start justify-center rounded-t-2xl pt-3 text-5xl font-black shadow-[0_-4px_0_0_rgba(255,255,255,0.3)_inset] ${color}`}
              >
                {place}
              </div>
            </div>
          ))}
        </div>

        {ranking.length > 3 && (
          <ol start={4} className="w-full max-w-md space-y-2">
            {ranking.slice(3).map((p, i) => (
              <li key={p.id} className="flex justify-between rounded-xl bg-white/15 px-4 py-2 font-bold">
                <span>
                  {i + 4}. {p.nickname}
                </span>
                <span>{p.score} pts</span>
              </li>
            ))}
          </ol>
        )}

        {errorBox}
        <button
          type="button"
          onClick={onExit}
          className="flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-lg font-black text-violet-700 shadow-[0_5px_0_0_rgba(0,0,0,0.25)] hover:bg-violet-50 active:translate-y-1 active:shadow-none"
        >
          <Home className="h-5 w-5" />
          Retour à l'espace animateur
        </button>
      </main>
    )
  }

  if (!question) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-violet-800 p-6 text-white">
        <p>Question introuvable.</p>
      </main>
    )
  }

  const showResults = session.status === 'results'
  const choices = visibleChoices(question.choices)
  const counts = question.choices.map((_, i) => currentAnswers.filter((a) => a.choice_index === i).length)
  const maxCount = Math.max(1, ...counts)
  const pointsThisRound = new Map(currentAnswers.map((a) => [a.player_id, a.points_awarded]))

  // ------------------------------------------------------------------ Question / résultats
  return (
    <main className="flex min-h-screen flex-col bg-gray-100">
      {/* Énoncé */}
      <header className="bg-white px-4 py-5 shadow">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <span className="shrink-0 rounded-full bg-violet-100 px-4 py-1.5 font-black text-violet-700">
            Question {index + 1}/{questions.length}
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-sm font-bold text-gray-600">
            PIN {session.pin}
          </span>
        </div>
        <h1 className="mx-auto mt-4 max-w-5xl text-center text-3xl font-black text-gray-900 sm:text-4xl">
          {question.text}
        </h1>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6">
        {errorBox}

        {/* Chrono + compteur, ou histogramme des réponses */}
        {!showResults ? (
          <div className="flex items-center justify-between">
            <div
              className={`flex h-28 w-28 items-center justify-center rounded-full text-5xl font-black text-white shadow-lg transition-colors ${
                secondsLeft <= 5 ? 'bg-red-600' : 'bg-violet-600'
              }`}
              aria-label={`${secondsLeft} secondes restantes`}
            >
              {secondsLeft}
            </div>
            <button
              type="button"
              onClick={() => void closeQuestion()}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2 font-bold text-gray-500 hover:bg-gray-200 disabled:opacity-50"
            >
              <SkipForward className="h-5 w-5" />
              Passer
            </button>
            <div className="flex flex-col items-center rounded-2xl bg-white px-6 py-3 shadow">
              <span className="text-4xl font-black text-gray-900" data-testid="answer-count">
                {currentAnswers.length}/{players.length}
              </span>
              <span className="flex items-center gap-1 text-sm font-bold text-gray-500">
                <MessageSquareText className="h-4 w-4" /> réponses
              </span>
            </div>
          </div>
        ) : (
          <div className="flex h-40 items-end justify-center gap-4">
            {choices.map(({ index: i }) => {
              const { bg, icon: Icon } = ANSWER_STYLES[i]
              const correct = i === question.correct_index
              return (
                <div key={i} className={`flex w-20 flex-col items-center gap-1 ${correct ? '' : 'opacity-40'}`}>
                  <span className="flex items-center gap-1 text-xl font-black text-gray-800">
                    {correct && <Check className="h-5 w-5 text-green-600" strokeWidth={4} />}
                    {counts[i]}
                  </span>
                  <div
                    className={`w-full rounded-t-lg ${bg}`}
                    style={{ height: `${Math.max(8, (counts[i] / maxCount) * 100)}px` }}
                  />
                  <Icon className="h-6 w-6 fill-gray-700 text-gray-700" />
                </div>
              )
            })}
          </div>
        )}

        {/* Choix de réponse */}
        <div className="grid gap-3 sm:grid-cols-2">
          {choices.map(({ text: choice, index: i }) => {
            const { bg, icon: Icon } = ANSWER_STYLES[i]
            const correct = i === question.correct_index
            return (
              <div
                key={i}
                className={`flex min-h-20 items-center gap-4 rounded-xl ${bg} px-5 py-4 text-2xl font-extrabold text-white shadow-[0_5px_0_0_rgba(0,0,0,0.2)] transition-opacity ${
                  showResults && !correct ? 'opacity-30' : ''
                }`}
              >
                <Icon className="h-8 w-8 shrink-0 fill-white" />
                <span className="flex-1">{choice}</span>
                {showResults && correct && <Check className="h-9 w-9 shrink-0" strokeWidth={4} />}
              </div>
            )
          })}
        </div>

        {/* Explication pédagogique (après la révélation de la bonne réponse) */}
        {showResults && (question.explanation_text || question.explanation_image) && (
          <section
            aria-label="Explication"
            className="overflow-hidden rounded-2xl border-4 border-amber-300 bg-amber-50 shadow-lg"
          >
            <h2 className="flex items-center gap-2 bg-amber-300 px-5 py-2 text-lg font-black text-amber-950">
              <Lightbulb className="h-5 w-5" /> Explication
            </h2>
            <div
              className={`flex flex-col gap-5 p-5 ${
                question.explanation_text && question.explanation_image ? "md:flex-row md:items-start" : "items-center"
              }`}
            >
              {question.explanation_image && (
                <img
                  src={question.explanation_image}
                  alt="Illustration de l'explication"
                  className="max-h-80 w-auto max-w-full self-center rounded-xl bg-white object-contain shadow md:max-w-[50%]"
                />
              )}
              {question.explanation_text && (
                <p className="flex-1 whitespace-pre-line text-xl font-medium leading-relaxed text-gray-900">
                  {question.explanation_text}
                </p>
              )}
            </div>
          </section>
        )}

        {/* Classement intermédiaire */}
        {showResults && (
          <section className="mx-auto w-full max-w-xl space-y-3 rounded-2xl bg-white p-5 shadow">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xl font-black text-gray-900">
                <Users className="h-5 w-5 text-violet-600" /> Classement
              </h2>
              <span className="text-sm font-semibold text-gray-500">Top 5</span>
            </div>
            <ol className="space-y-2">
              {ranking.slice(0, 5).map((p, i) => {
                const gained = pointsThisRound.get(p.id) ?? 0
                return (
                  <li
                    key={p.id}
                    className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-2 text-lg font-bold text-gray-800"
                  >
                    <span className="w-6 text-violet-700">{i + 1}</span>
                    <span className="flex-1 truncate">{p.nickname}</span>
                    {gained > 0 && <span className="text-sm text-green-600">+{gained}</span>}
                    <span className="tabular-nums">{p.score}</span>
                  </li>
                )
              })}
            </ol>
            <button
              type="button"
              onClick={() => void (isLast ? finishGame() : goToNextQuestion())}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-lg font-black text-white shadow-[0_4px_0_0_rgba(0,0,0,0.25)] hover:bg-violet-700 active:translate-y-0.5 active:shadow-none disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : isLast ? (
                <Trophy className="h-5 w-5" />
              ) : (
                <ChevronRight className="h-5 w-5" />
              )}
              {isLast ? 'Voir le podium final' : 'Question suivante'}
            </button>
          </section>
        )}
      </div>
    </main>
  )
}
