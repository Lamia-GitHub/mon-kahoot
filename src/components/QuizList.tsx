import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, BookOpen, Loader2, Pencil, Play, RefreshCw, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { supabaseErrorDetails } from '../lib/errors'
import type { GameSession } from '../types/database'

interface QuizSummary {
  id: string
  title: string
  created_at: string
  questionCount: number
}

interface QuizListProps {
  onLaunched: (session: GameSession, quizTitle: string) => void
  onEdit: (quizId: string) => void
  // Demande le code animateur avant d'exécuter l'action
  requireAdmin: (action: () => void) => void
}

export default function QuizList({ onLaunched, onEdit, requireAdmin }: QuizListProps) {
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null) // quiz en cours de lancement/suppression

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('quizzes')
      .select('id, title, created_at, questions(count)')
      .is('questions.archived_at', null) // ne compte que la version actuelle
      .order('created_at', { ascending: false })

    if (error) {
      setError(['Impossible de charger les quiz.', ...supabaseErrorDetails(error)])
    } else {
      setQuizzes(
        data.map((q) => ({
          id: q.id,
          title: q.title,
          created_at: q.created_at,
          questionCount: q.questions[0]?.count ?? 0,
        })),
      )
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleLaunch(quiz: QuizSummary) {
    setBusyId(quiz.id)
    setError(null)
    // Le PIN est généré par Supabase (valeur par défaut de la colonne)
    const { data, error } = await supabase
      .from('game_sessions')
      .insert({ quiz_id: quiz.id, status: 'lobby' })
      .select('*')
      .single()
    setBusyId(null)

    if (error) {
      setError([`Impossible de lancer « ${quiz.title} ».`, ...supabaseErrorDetails(error)])
      return
    }
    onLaunched(data, quiz.title)
  }

  async function handleDelete(quiz: QuizSummary) {
    const ok = window.confirm(
      `Supprimer définitivement le quiz « ${quiz.title} » et ses ${quiz.questionCount} question(s) ?\nL'historique de ses parties (statistiques) sera aussi supprimé.\nCette action est irréversible.`,
    )
    if (!ok) return

    setBusyId(quiz.id)
    setError(null)
    const { error } = await supabase.from('quizzes').delete().eq('id', quiz.id)
    setBusyId(null)

    if (error) {
      setError([`Impossible de supprimer « ${quiz.title} ».`, ...supabaseErrorDetails(error)])
      return
    }
    setQuizzes((qs) => qs.filter((q) => q.id !== quiz.id))
  }

  return (
    <section className="w-full space-y-4 rounded-3xl bg-white/10 p-5 ring-1 ring-white/20 backdrop-blur">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-extrabold text-white">
          <BookOpen className="h-6 w-6" />
          Mes Quiz
        </h2>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          title="Actualiser"
          className="rounded-lg p-2 text-white/80 hover:bg-white/15 hover:text-white disabled:opacity-50"
        >
          <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
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
      )}

      {loading && quizzes.length === 0 ? (
        <p className="flex items-center justify-center gap-2 py-4 text-white/80">
          <Loader2 className="h-5 w-5 animate-spin" /> Chargement…
        </p>
      ) : quizzes.length === 0 && !error ? (
        <p className="py-4 text-center text-white/80">
          Aucun quiz pour l'instant. Crée ton premier quiz ci-dessus !
        </p>
      ) : (
        <ul className="space-y-3">
          {quizzes.map((quiz) => {
            const busy = busyId === quiz.id
            const empty = quiz.questionCount === 0
            return (
              <li
                key={quiz.id}
                className="space-y-3 rounded-2xl bg-white p-3 pl-4 shadow-lg"
              >
                <div className="min-w-0">
                  <p className="truncate font-bold text-gray-900" title={quiz.title}>
                    {quiz.title}
                  </p>
                  <p className="text-sm text-gray-500">
                    {quiz.questionCount} question{quiz.questionCount > 1 ? 's' : ''} ·{' '}
                    {new Date(quiz.created_at).toLocaleDateString('fr-FR')}
                  </p>
                </div>
                {/* Actions animateur (code secret demandé une fois par onglet) */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => requireAdmin(() => void handleLaunch(quiz))}
                    disabled={busyId !== null || empty}
                    title={empty ? 'Ce quiz ne contient aucune question' : 'Lancer une partie'}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-green-600 px-3 py-2 font-extrabold text-white shadow-[0_3px_0_0_rgba(0,0,0,0.25)] hover:bg-green-700 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-white" />}
                    Lancer
                  </button>
                  <button
                    type="button"
                    onClick={() => requireAdmin(() => onEdit(quiz.id))}
                    disabled={busyId !== null}
                    title="Modifier le quiz"
                    aria-label={`Modifier ${quiz.title}`}
                    className="flex items-center gap-1.5 rounded-xl border-2 border-violet-200 px-3 py-1.5 font-bold text-violet-700 hover:border-violet-400 hover:bg-violet-50 disabled:opacity-50"
                  >
                    <Pencil className="h-4 w-4" />
                    Modifier
                  </button>
                  <button
                    type="button"
                    onClick={() => requireAdmin(() => void handleDelete(quiz))}
                    disabled={busyId !== null}
                    title="Supprimer le quiz"
                    aria-label={`Supprimer ${quiz.title}`}
                    className="rounded-xl p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
