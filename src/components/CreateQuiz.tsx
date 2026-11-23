import { useEffect, useState } from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  Save,
  Trash2,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { ANSWER_STYLES } from '../lib/answerStyles'
import { supabaseErrorDetails } from '../lib/errors'
import { isValidImageSource } from '../lib/image'
import ExplanationEditor from './ExplanationEditor'
import type { Question, SaveQuizQuestion } from '../types/database'

const DURATIONS = [10, 20, 30] as const

interface DraftQuestion {
  key: string // identifiant local (pour React)
  dbId: string | null // id en base (null = nouvelle question pas encore enregistrée)
  text: string
  choices: [string, string, string, string]
  correctIndex: number | null
  timeLimit: number // secondes
  explanationText: string
  explanationImage: string // '', URL http(s) ou data URL
}

type Status =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'success'; title: string; count: number }
  | { kind: 'error'; message: string; details?: string[] }

function newQuestion(): DraftQuestion {
  return {
    key: crypto.randomUUID(),
    dbId: null,
    text: '',
    choices: ['', '', '', ''],
    correctIndex: null,
    timeLimit: 20,
    explanationText: '',
    explanationImage: '',
  }
}

// Question chargée depuis Supabase → brouillon modifiable (les choix sont complétés à 4)
function draftFromQuestion(q: Question): DraftQuestion {
  const choices: DraftQuestion['choices'] = ['', '', '', '']
  q.choices.slice(0, 4).forEach((c, i) => (choices[i] = c))
  return {
    key: crypto.randomUUID(),
    dbId: q.id,
    text: q.text,
    choices,
    correctIndex: q.correct_index,
    timeLimit: q.time_limit,
    explanationText: q.explanation_text ?? '',
    explanationImage: q.explanation_image ?? '',
  }
}

// Vérifie le quiz avant envoi ; renvoie la liste des problèmes (vide si OK)
function validate(title: string, questions: DraftQuestion[]): string[] {
  const problems: string[] = []
  if (!title.trim()) problems.push('Le quiz doit avoir un titre.')
  if (questions.length === 0) problems.push('Ajoute au moins une question.')

  questions.forEach((q, i) => {
    const n = `Question ${i + 1}`
    if (!q.text.trim()) problems.push(`${n} : l'énoncé est vide.`)
    const filled = q.choices.filter((c) => c.trim()).length
    if (filled < 2) problems.push(`${n} : remplis au moins 2 choix de réponse.`)
    if (q.correctIndex === null) {
      problems.push(`${n} : coche la bonne réponse.`)
    } else if (!q.choices[q.correctIndex].trim()) {
      problems.push(`${n} : la bonne réponse cochée est vide.`)
    }
    if (q.explanationImage && !isValidImageSource(q.explanationImage)) {
      problems.push(`${n} : l'URL de l'image explicative doit commencer par http:// ou https://.`)
    }
  })
  return problems
}

function describeSupabaseError(step: string, error: PostgrestError): Status {
  return { kind: 'error', message: `Échec lors de ${step}.`, details: supabaseErrorDetails(error) }
}

interface CreateQuizProps {
  onBack: () => void
  // Si fourni : l'éditeur s'ouvre en mode modification de ce quiz
  quizId?: string
}

type LoadState = { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; details: string[] }

export default function CreateQuiz({ onBack, quizId }: CreateQuizProps) {
  const isEdit = quizId !== undefined
  const [title, setTitle] = useState('')
  const [questions, setQuestions] = useState<DraftQuestion[]>(() => (isEdit ? [] : [newQuestion()]))
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [load, setLoad] = useState<LoadState>(() => (isEdit ? { kind: 'loading' } : { kind: 'ready' }))

  const saving = status.kind === 'saving'

  // Mode modification : chargement du quiz et de toutes ses questions
  useEffect(() => {
    if (!quizId) return
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase
        .from('quizzes')
        .select('id, title, questions(*)')
        .eq('id', quizId)
        .is('questions.archived_at', null) // versions archivées = historique, non modifiables
        .single()
      if (cancelled) return
      if (error) {
        setLoad({ kind: 'error', details: supabaseErrorDetails(error) })
        return
      }
      setTitle(data.title)
      const sorted = [...data.questions].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      setQuestions(sorted.length > 0 ? sorted.map(draftFromQuestion) : [newQuestion()])
      setLoad({ kind: 'ready' })
    })()
    return () => {
      cancelled = true
    }
  }, [quizId])

  function updateQuestion(key: string, patch: Partial<DraftQuestion>) {
    setQuestions((qs) => qs.map((q) => (q.key === key ? { ...q, ...patch } : q)))
    if (status.kind === 'error') setStatus({ kind: 'idle' })
  }

  function updateChoice(key: string, index: number, value: string) {
    setQuestions((qs) =>
      qs.map((q) => {
        if (q.key !== key) return q
        const choices = [...q.choices] as DraftQuestion['choices']
        choices[index] = value
        return { ...q, choices }
      }),
    )
    if (status.kind === 'error') setStatus({ kind: 'idle' })
  }

  function removeQuestion(key: string) {
    setQuestions((qs) => qs.filter((q) => q.key !== key))
  }

  function resetForm() {
    setTitle('')
    setQuestions([newQuestion()])
    setStatus({ kind: 'idle' })
  }

  async function handleSave() {
    const problems = validate(title, questions)
    if (problems.length > 0) {
      setStatus({ kind: 'error', message: 'Le quiz est incomplet.', details: problems })
      return
    }

    setStatus({ kind: 'saving' })

    // Chaque choix garde sa position (donc sa couleur) : un choix vide au milieu est
    // enregistré comme "" et masqué en jeu ; seuls les choix vides en fin de liste sont retirés.
    const payload: SaveQuizQuestion[] = questions.map((q) => {
      const trimmed = q.choices.map((c) => c.trim())
      const lastFilled = trimmed.reduce((last, c, i) => (c ? i : last), -1)
      return {
        id: q.dbId, // null = nouvelle question
        text: q.text.trim(),
        choices: trimmed.slice(0, lastFilled + 1),
        correct_index: q.correctIndex as number, // vérifié non nul et non vide par validate()
        time_limit: q.timeLimit,
        explanation_text: q.explanationText.trim() || null,
        explanation_image: q.explanationImage || null,
      }
    })

    // Une seule transaction côté Supabase (fonction save_quiz) : création ou mise à jour
    // du titre + ajout / modification / suppression / réordonnancement des questions.
    const { error } = await supabase.rpc('save_quiz', {
      p_quiz_id: quizId ?? null,
      p_title: title.trim(),
      p_questions: payload,
    })

    if (error) {
      setStatus(
        describeSupabaseError(isEdit ? "l'enregistrement des modifications" : "l'enregistrement du quiz", error),
      )
      return
    }

    setStatus({ kind: 'success', title: title.trim(), count: payload.length })
  }

  if (load.kind !== 'ready') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-100 p-4">
        {load.kind === 'loading' ? (
          <p className="flex items-center gap-2 text-lg font-semibold text-gray-600">
            <Loader2 className="h-6 w-6 animate-spin" /> Chargement du quiz…
          </p>
        ) : (
          <div role="alert" className="w-full max-w-md rounded-2xl bg-red-50 p-5 text-sm text-red-800">
            <p className="flex items-center gap-2 font-bold">
              <AlertTriangle className="h-4 w-4" /> Impossible de charger le quiz.
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-6">
              {load.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>
        )}
        <button
          onClick={onBack}
          className="flex items-center gap-1 rounded-lg px-3 py-2 font-semibold text-gray-600 hover:bg-gray-200"
        >
          <ArrowLeft className="h-5 w-5" /> Espace animateur
        </button>
      </main>
    )
  }

  if (status.kind === 'success') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-violet-800 via-purple-700 to-fuchsia-600 p-4">
        <div className="w-full max-w-md space-y-6 rounded-3xl bg-white p-8 text-center shadow-2xl">
          <CheckCircle2 className="mx-auto h-16 w-16 text-green-600" />
          <div>
            <h2 className="text-2xl font-black text-gray-900">
              {isEdit ? 'Modifications enregistrées !' : 'Quiz enregistré !'}
            </h2>
            <p className="mt-2 text-gray-600">
              « {status.title} » a été sauvegardé avec {status.count} question
              {status.count > 1 ? 's' : ''}.
            </p>
          </div>
          <div className="grid gap-3">
            {!isEdit && (
              <button
                onClick={resetForm}
                className="rounded-xl bg-violet-600 py-3 font-bold text-white hover:bg-violet-700"
              >
                Créer un autre quiz
              </button>
            )}
            <button
              onClick={onBack}
              className={
                isEdit
                  ? 'rounded-xl bg-violet-600 py-3 font-bold text-white hover:bg-violet-700'
                  : 'rounded-xl border-2 border-gray-200 py-3 font-bold text-gray-700 hover:bg-gray-50'
              }
            >
              Retour à l'espace animateur
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-100 pb-32">
      {/* Barre du haut */}
      <header className="sticky top-0 z-10 bg-white shadow">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1 rounded-lg px-3 py-2 font-semibold text-gray-600 hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5" />
            Espace animateur
          </button>
          {isEdit && (
            <span className="hidden shrink-0 rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-800 sm:inline">
              Modification
            </span>
          )}
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              if (status.kind === 'error') setStatus({ kind: 'idle' })
            }}
            maxLength={200}
            placeholder="Titre du quiz"
            className="min-w-0 flex-1 rounded-lg border-2 border-gray-200 px-4 py-2 text-lg font-bold text-gray-900 placeholder:font-semibold placeholder:text-gray-400 focus:border-violet-500 focus:outline-none"
          />
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        {questions.map((q, i) => (
          <section key={q.key} className="space-y-4 rounded-2xl bg-white p-5 shadow">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-black text-violet-700">Question {i + 1}</h2>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
                  <Clock className="ml-1 h-4 w-4 text-gray-500" />
                  {DURATIONS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => updateQuestion(q.key, { timeLimit: d })}
                      className={`rounded-md px-3 py-1 text-sm font-bold transition ${
                        q.timeLimit === d
                          ? 'bg-violet-600 text-white shadow'
                          : 'text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {d}s
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => removeQuestion(q.key)}
                  disabled={questions.length === 1}
                  title="Supprimer la question"
                  className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            </div>

            <textarea
              value={q.text}
              onChange={(e) => updateQuestion(q.key, { text: e.target.value })}
              maxLength={500}
              rows={2}
              placeholder="Écris ta question ici…"
              className="w-full resize-none rounded-xl border-2 border-gray-200 px-4 py-3 text-center text-xl font-bold text-gray-900 placeholder:text-gray-400 focus:border-violet-500 focus:outline-none"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              {ANSWER_STYLES.map(({ icon: Icon, bg, ring, label }, index) => {
                const isCorrect = q.correctIndex === index
                return (
                  <div
                    key={label}
                    className={`flex items-center gap-3 rounded-xl ${bg} p-3 shadow-[0_4px_0_0_rgba(0,0,0,0.2)] ${
                      isCorrect ? `ring-4 ${ring}` : ''
                    }`}
                  >
                    <Icon className="h-7 w-7 shrink-0 fill-white text-white" />
                    <input
                      value={q.choices[index]}
                      onChange={(e) => updateChoice(q.key, index, e.target.value)}
                      maxLength={120}
                      placeholder={`Réponse ${index + 1}${index >= 2 ? ' (facultatif)' : ''}`}
                      aria-label={`Réponse ${label}`}
                      className="min-w-0 flex-1 bg-transparent text-lg font-bold text-white placeholder:text-white/70 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => updateQuestion(q.key, { correctIndex: index })}
                      title={isCorrect ? 'Bonne réponse' : 'Marquer comme bonne réponse'}
                      aria-pressed={isCorrect}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-4 border-white transition ${
                        isCorrect ? 'bg-white text-green-600' : 'bg-white/10 text-transparent hover:bg-white/30'
                      }`}
                    >
                      <CheckCircle2 className="h-6 w-6" />
                    </button>
                  </div>
                )
              })}
            </div>

            <ExplanationEditor
              text={q.explanationText}
              image={q.explanationImage}
              onChange={(patch) => updateQuestion(q.key, patch)}
            />
          </section>
        ))}

        <button
          type="button"
          onClick={() => setQuestions((qs) => [...qs, newQuestion()])}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-4 border-dashed border-violet-300 py-5 text-lg font-bold text-violet-700 hover:border-violet-500 hover:bg-violet-50"
        >
          <Plus className="h-6 w-6" />
          Ajouter une question
        </button>
      </div>

      {/* Barre d'enregistrement */}
      <footer className="fixed inset-x-0 bottom-0 border-t bg-white/95 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] backdrop-blur">
        <div className="mx-auto max-w-4xl space-y-3 px-4 py-3">
          {status.kind === 'error' && (
            <div
              role="alert"
              className="max-h-40 overflow-y-auto rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              <p className="flex items-center gap-2 font-bold">
                <AlertTriangle className="h-4 w-4" />
                {status.message}
              </p>
              {status.details && status.details.length > 0 && (
                <ul className="mt-1 list-disc space-y-0.5 pl-6">
                  {status.details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-gray-500">
              {questions.length} question{questions.length > 1 ? 's' : ''}
            </span>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-green-600 px-6 py-3 text-lg font-extrabold text-white shadow-[0_4px_0_0_rgba(0,0,0,0.25)] hover:bg-green-700 active:translate-y-0.5 active:shadow-none disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              {saving ? 'Enregistrement…' : isEdit ? 'Enregistrer les modifications' : 'Enregistrer le quiz'}
            </button>
          </div>
        </div>
      </footer>
    </main>
  )
}
