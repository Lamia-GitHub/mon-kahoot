import { useEffect, useState } from 'react'
import { CheckCircle2, Clock, Home, Loader2, Medal, Send, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { ANSWER_STYLES, visibleChoices } from '../lib/answerStyles'
import { ordinal, rankOf, sortByScore } from '../lib/ranking'
import type { Answer, GameSession, Player, Question } from '../types/database'

// Le joueur n'a besoin que du nombre de choix : on ne charge ni l'énoncé ni la bonne réponse
type PlayerQuestion = Pick<Question, 'id' | 'position' | 'choices'>

interface PlayerGameProps {
  player: Player
  session: GameSession
  onLeave: () => void
}

export default function PlayerGame({ player, session: initialSession, onLeave }: PlayerGameProps) {
  const [session, setSession] = useState(initialSession)
  const [questions, setQuestions] = useState<PlayerQuestion[] | null>(null)
  const [myAnswers, setMyAnswers] = useState<Record<string, Answer>>({}) // par question_id
  const [ranking, setRanking] = useState<Player[] | null>(null)
  const [sending, setSending] = useState(false)
  // Erreur d'envoi, rattachée à la question concernée (disparaît à la question suivante)
  const [sendError, setSendError] = useState<{ questionId: string; message: string } | null>(null)

  const index = session.current_question_index
  const question = questions?.[index] ?? null
  const myAnswer = question ? myAnswers[question.id] : undefined

  // Questions du quiz (nombre de choix uniquement)
  useEffect(() => {
    let cancelled = false
    void supabase
      .from('questions')
      .select('id, position, choices')
      .eq('quiz_id', session.quiz_id)
      .is('archived_at', null)
      .order('position')
      .then(({ data }) => {
        if (!cancelled && data) setQuestions(data)
      })
    return () => {
      cancelled = true
    }
  }, [session.quiz_id])

  // Suit la partie en direct (nouvelle question, résultats, fin)
  useEffect(() => {
    let cancelled = false
    const channel = supabase
      .channel(`player-game-${session.id}-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${session.id}` },
        (payload) => setSession(payload.new as GameSession),
      )
      .subscribe(async (s) => {
        if (s !== 'SUBSCRIBED' || cancelled) return
        const { data } = await supabase.from('game_sessions').select('*').eq('id', session.id).single()
        if (!cancelled && data) setSession(data)
      })
    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [session.id])

  // À l'affichage des résultats / de la fin : récupère le classement et sa propre réponse
  useEffect(() => {
    if (session.status !== 'results' && session.status !== 'finished') return
    let cancelled = false
    setRanking(null)
    void (async () => {
      const { data: players } = await supabase.from('players').select('*').eq('session_id', session.id)
      if (cancelled) return
      setRanking(players ? sortByScore(players) : [])

      if (question && session.status === 'results') {
        const { data: answer } = await supabase
          .from('answers')
          .select('*')
          .eq('player_id', player.id)
          .eq('question_id', question.id)
          .maybeSingle()
        if (!cancelled && answer) setMyAnswers((m) => ({ ...m, [answer.question_id]: answer }))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [session.status, session.id, question, player.id])

  async function sendAnswer(choiceIndex: number) {
    if (!question || myAnswer || sending) return
    setSending(true)
    setSendError(null)
    const { data, error } = await supabase
      .from('answers')
      .insert({ session_id: session.id, player_id: player.id, question_id: question.id, choice_index: choiceIndex })
      .select('*')
      .single()
    setSending(false)
    if (error) {
      setSendError({
        questionId: question.id,
        message: error.code === '23505'
          ? 'Tu as déjà répondu à cette question.'
          : error.message.includes('pas ouvertes') || error.message.includes('question en cours')
            ? 'Trop tard, la question est terminée !'
            : `Réponse non envoyée : ${error.message}`,
      })
      return
    }
    setMyAnswers((m) => ({ ...m, [data.question_id]: data }))
  }

  const me = ranking?.find((p) => p.id === player.id)
  const rank = ranking ? rankOf(ranking, player.id) : null

  const header = (
    <header className="flex items-center justify-between bg-black/20 px-4 py-3 text-white">
      <span className="font-black">{player.nickname}</span>
      {questions && index >= 0 && session.status !== 'finished' && (
        <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-bold">
          Question {Math.min(index + 1, questions.length)}/{questions.length}
        </span>
      )}
      <span className="text-sm font-semibold text-white/80">PIN {session.pin}</span>
    </header>
  )

  // ------------------------------------------------------------------ Fin de partie
  if (session.status === 'finished') {
    const total = ranking?.length ?? 0
    const onPodium = rank !== null && rank <= 3
    return (
      <main className="flex min-h-screen flex-col bg-gradient-to-br from-violet-800 via-purple-700 to-fuchsia-600">
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center text-white">
          {!ranking ? (
            <Loader2 className="h-12 w-12 animate-spin" />
          ) : (
            <>
              <Medal className={`h-24 w-24 ${onPodium ? 'text-amber-300' : 'text-white/70'}`} />
              <div className="space-y-2">
                <p className="text-xl font-semibold text-white/85">Partie terminée !</p>
                <h1 className="text-5xl font-black">
                  {rank !== null ? `${ordinal(rank)} sur ${total}` : 'Classement indisponible'}
                </h1>
                <p className="text-xl font-bold">
                  {onPodium ? 'Bravo, tu es sur le podium !' : 'Bien joué, la prochaine sera la bonne !'}
                </p>
              </div>
              <p className="rounded-2xl bg-white px-8 py-4 text-3xl font-black text-violet-700">
                {me?.score ?? 0} pts
              </p>
            </>
          )}
          <button
            type="button"
            onClick={onLeave}
            className="flex items-center gap-2 rounded-xl bg-white/15 px-6 py-3 font-bold ring-2 ring-white/40 hover:bg-white/25"
          >
            <Home className="h-5 w-5" />
            Retour à l'accueil
          </button>
        </div>
      </main>
    )
  }

  // ------------------------------------------------------------------ Résultats de la question
  if (session.status === 'results') {
    const correct = myAnswer?.is_correct ?? false
    const bg = !myAnswer ? 'from-gray-700 to-gray-800' : correct ? 'from-green-600 to-emerald-700' : 'from-red-600 to-rose-700'
    return (
      <main className={`flex min-h-screen flex-col bg-gradient-to-br ${bg}`}>
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center text-white">
          {!myAnswer ? (
            <Clock className="h-24 w-24" />
          ) : correct ? (
            <CheckCircle2 className="h-24 w-24" />
          ) : (
            <XCircle className="h-24 w-24" />
          )}
          <h1 className="text-5xl font-black">
            {!myAnswer ? 'Temps écoulé !' : correct ? 'Bonne réponse !' : 'Raté !'}
          </h1>
          <p className="rounded-full bg-black/20 px-6 py-2 text-2xl font-black">
            +{myAnswer?.points_awarded ?? 0} points
          </p>
          {!ranking ? (
            <Loader2 className="h-8 w-8 animate-spin" />
          ) : (
            <div className="space-y-1">
              <p className="text-xl font-bold">Score total : {me?.score ?? 0} pts</p>
              {rank !== null && (
                <p className="text-lg text-white/90">
                  Tu es <strong>{ordinal(rank)}</strong> sur {ranking.length}
                </p>
              )}
            </div>
          )}
          <p className="text-sm text-white/75">Regarde l'écran principal…</p>
        </div>
      </main>
    )
  }

  // ------------------------------------------------------------------ Question en cours
  return (
    <main className="flex min-h-screen flex-col bg-gradient-to-br from-violet-800 via-purple-700 to-fuchsia-600">
      {header}
      {!question ? (
        <div className="flex flex-1 items-center justify-center text-white">
          <Loader2 className="h-12 w-12 animate-spin" />
        </div>
      ) : myAnswer ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center text-white">
          {(() => {
            const { bg, icon: Icon } = ANSWER_STYLES[myAnswer.choice_index]
            return (
              <div className={`flex h-28 w-28 items-center justify-center rounded-3xl ${bg} shadow-xl`}>
                <Icon className="h-16 w-16 fill-white text-white" />
              </div>
            )
          })()}
          <h1 className="flex items-center gap-3 text-4xl font-black">
            <Send className="h-9 w-9" /> Réponse envoyée !
          </h1>
          <p className="flex items-center gap-2 text-xl text-white/85">
            <Loader2 className="h-5 w-5 animate-spin" /> En attente des autres…
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-3 p-3">
          {sendError?.questionId === question.id && (
            <p role="alert" className="rounded-xl bg-white px-4 py-3 text-center font-bold text-red-700">
              {sendError.message}
            </p>
          )}
          <div className={`grid flex-1 gap-3 ${visibleChoices(question.choices).length > 2 ? 'grid-cols-2 grid-rows-2' : 'grid-cols-1 grid-rows-2 sm:grid-cols-2 sm:grid-rows-1'}`}>
            {visibleChoices(question.choices).map(({ index: i }) => {
              const { bg, icon: Icon, label } = ANSWER_STYLES[i]
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => void sendAnswer(i)}
                  disabled={sending}
                  aria-label={`Réponse ${label}`}
                  className={`flex min-h-32 items-center justify-center rounded-2xl ${bg} shadow-[0_6px_0_0_rgba(0,0,0,0.25)] transition hover:brightness-110 active:translate-y-1 active:shadow-none disabled:opacity-60`}
                >
                  <Icon className="h-20 w-20 fill-white text-white" />
                </button>
              )
            })}
          </div>
        </div>
      )}
    </main>
  )
}
