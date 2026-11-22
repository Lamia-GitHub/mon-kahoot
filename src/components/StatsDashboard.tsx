import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Clock,
  Download,
  Gamepad2,
  Loader2,
  RefreshCw,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { supabaseErrorDetails } from '../lib/errors'
import {
  buildCsv,
  computeStats,
  downloadCsv,
  formatDate,
  formatPercent,
  formatSeconds,
  loadStatsData,
  masteryLevel,
  type MasteryLevel,
  type StatsData,
} from '../lib/stats'

// Niveaux de maîtrise : la couleur est toujours accompagnée d'une icône et d'un libellé
const LEVELS: Record<MasteryLevel, { label: string; icon: LucideIcon; bar: string; iconColor: string }> = {
  weak: { label: 'À renforcer', icon: AlertTriangle, bar: 'bg-red-600', iconColor: 'text-red-600' },
  medium: { label: 'À consolider', icon: CircleAlert, bar: 'bg-amber-500', iconColor: 'text-amber-600' },
  strong: { label: 'Maîtrisé', icon: CheckCircle2, bar: 'bg-green-600', iconColor: 'text-green-600' },
}

function RateBar({ rate, detail }: { rate: number; detail: string }) {
  const level = LEVELS[masteryLevel(rate)]
  const Icon = level.icon
  return (
    <div className="min-w-44" title={detail}>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-black tabular-nums text-gray-900">{formatPercent(rate)}</span>
        <span className="flex items-center gap-1 font-semibold text-gray-600">
          <Icon className={`h-4 w-4 ${level.iconColor}`} aria-hidden />
          {level.label}
        </span>
      </div>
      <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-gray-200" aria-hidden>
        <div className={`h-full rounded-full ${level.bar}`} style={{ width: `${Math.round(rate * 100)}%` }} />
      </div>
    </div>
  )
}

function StatTile({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow">
      <p className="flex items-center gap-2 text-sm font-semibold text-gray-500">
        <Icon className="h-4 w-4 text-violet-600" aria-hidden />
        {label}
      </p>
      <p className="mt-2 text-4xl font-black tabular-nums text-gray-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  )
}

interface StatsDashboardProps {
  onBack: () => void
}

export default function StatsDashboard({ onBack }: StatsDashboardProps) {
  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string[] | null>(null)
  const [quizId, setQuizId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await loadStatsData())
    } catch (err) {
      const details =
        err && typeof err === 'object' && 'message' in err
          ? supabaseErrorDetails(err as Parameters<typeof supabaseErrorDetails>[0])
          : [String(err)]
      setError(details)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filter = useMemo(() => ({ quizId, sessionId }), [quizId, sessionId])
  const stats = useMemo(() => (data ? computeStats(data, filter) : null), [data, filter])

  // Choix proposés dans les filtres (uniquement des quiz / sessions ayant été joués)
  const quizOptions = useMemo(() => {
    if (!data) return []
    const counts = new Map<string, number>()
    data.sessions.forEach((s) => counts.set(s.quiz_id, (counts.get(s.quiz_id) ?? 0) + 1))
    return data.quizzes
      .filter((q) => counts.has(q.id))
      .map((q) => ({ id: q.id, title: q.title, sessions: counts.get(q.id) ?? 0 }))
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [data])

  const sessionOptions = useMemo(() => {
    if (!data) return []
    const playerCount = new Map<string, number>()
    data.players.forEach((p) => playerCount.set(p.session_id, (playerCount.get(p.session_id) ?? 0) + 1))
    const title = new Map(data.quizzes.map((q) => [q.id, q.title]))
    return data.sessions
      .filter((s) => !quizId || s.quiz_id === quizId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((s) => ({
        id: s.id,
        label: `${formatDate(s.created_at)} · PIN ${s.pin} · ${playerCount.get(s.id) ?? 0} joueur(s)${
          quizId ? '' : ` · ${title.get(s.quiz_id) ?? ''}`
        }`,
      }))
  }, [data, quizId])

  function handleExport() {
    if (!data) return
    const quizPart = quizId ? quizOptions.find((q) => q.id === quizId)?.title ?? 'quiz' : 'tous-les-quiz'
    const slug = quizPart
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
    const now = new Date() // date locale (toISOString donnerait la date UTC)
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    downloadCsv(buildCsv(data, filter), `statistiques-${slug || 'quiz'}-${day}.csv`)
  }

  const selectClass =
    'w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 font-semibold text-gray-800 focus:border-violet-500 focus:outline-none'

  return (
    <main className="min-h-screen bg-gray-100 pb-12">
      <header className="sticky top-0 z-10 bg-white shadow">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1 rounded-lg px-3 py-2 font-semibold text-gray-600 hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5" />
            Accueil
          </button>
          <h1 className="flex-1 text-xl font-black text-gray-900">Statistiques &amp; Analyses</h1>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            title="Actualiser"
            aria-label="Actualiser"
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
          >
            <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={!stats || stats.sessionsCount === 0}
            className="flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 font-bold text-white shadow-[0_3px_0_0_rgba(0,0,0,0.2)] hover:bg-green-700 active:translate-y-0.5 active:shadow-none disabled:opacity-50"
          >
            <Download className="h-5 w-5" />
            Exporter en CSV
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        {error && (
          <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
            <p className="flex items-center gap-2 font-bold">
              <AlertTriangle className="h-4 w-4" /> Impossible de charger les statistiques.
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-6">
              {error.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Filtres */}
        <div className="grid gap-3 rounded-2xl bg-white p-4 shadow sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-600">Quiz</span>
            <select
              value={quizId ?? ''}
              onChange={(e) => {
                setQuizId(e.target.value || null)
                setSessionId(null)
              }}
              className={selectClass}
            >
              <option value="">Tous les quiz (statistiques globales)</option>
              {quizOptions.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.title} ({q.sessions} partie{q.sessions > 1 ? 's' : ''})
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-600">Session</span>
            <select value={sessionId ?? ''} onChange={(e) => setSessionId(e.target.value || null)} className={selectClass}>
              <option value="">Toutes les sessions</option>
              {sessionOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading && !stats ? (
          <p className="flex items-center justify-center gap-2 py-16 text-lg font-semibold text-gray-500">
            <Loader2 className="h-6 w-6 animate-spin" /> Chargement des statistiques…
          </p>
        ) : stats && stats.sessionsCount === 0 ? (
          <p className="rounded-2xl bg-white p-10 text-center text-gray-600 shadow">
            Aucune partie jouée pour l'instant. Les statistiques apparaîtront après la première partie.
          </p>
        ) : stats ? (
          <>
            {/* Indicateurs clés */}
            <section aria-label="Indicateurs clés" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile icon={Gamepad2} label="Parties jouées" value={String(stats.sessionsCount)} />
              <StatTile icon={Users} label="Participants" value={String(stats.participants)} hint="Cumul des joueurs inscrits" />
              <StatTile
                icon={Target}
                label="Taux de réussite global"
                value={formatPercent(stats.successRate)}
                hint="Une question sans réponse compte comme non réussie"
              />
              <StatTile icon={Clock} label="Temps moyen de réponse" value={formatSeconds(stats.avgTimeMs)} />
            </section>

            {/* Analyse par question */}
            <section className="space-y-3 rounded-2xl bg-white p-5 shadow">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-gray-900">
                    Analyse par question (Points forts &amp; Axes d'amélioration)
                  </h2>
                  <p className="text-sm text-gray-500">Triée du taux de réussite le plus faible au plus élevé.</p>
                </div>
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600" aria-label="Légende">
                  {(['weak', 'medium', 'strong'] as const).map((lvl) => {
                    const { label, icon: Icon, iconColor } = LEVELS[lvl]
                    const range = lvl === 'weak' ? '< 50 %' : lvl === 'medium' ? '50–75 %' : '≥ 75 %'
                    return (
                      <li key={lvl} className="flex items-center gap-1">
                        <Icon className={`h-4 w-4 ${iconColor}`} aria-hidden /> {label} ({range})
                      </li>
                    )
                  })}
                </ul>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[56rem] text-left text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                      <th className="py-2 pr-4 font-bold">Question</th>
                      <th className="py-2 pr-4 font-bold">Bonne réponse</th>
                      <th className="py-2 pr-4 font-bold">Taux de réussite</th>
                      <th className="py-2 pr-4 text-right font-bold">Réussites</th>
                      <th className="py-2 pr-4 text-right font-bold">Sans réponse</th>
                      <th className="py-2 pr-4 text-right font-bold">Temps moyen</th>
                      <th className="py-2 font-bold">Erreur la plus fréquente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.questions.map((q) => (
                      <tr key={q.questionId} className="border-b border-gray-100 align-top">
                        <td className="max-w-xs py-3 pr-4">
                          <p className="font-semibold text-gray-900">{q.text}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                            {!quizId && <span>{q.quizTitle}</span>}
                            {q.archived && (
                              <span
                                className="rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-gray-600"
                                title="Question modifiée ou retirée depuis : statistiques de la version jouée à l'époque"
                              >
                                Ancienne version
                              </span>
                            )}
                          </p>
                        </td>
                        <td className="py-3 pr-4 text-gray-700">{q.correctAnswer}</td>
                        <td className="py-3 pr-4">
                          <RateBar
                            rate={q.rate}
                            detail={`${q.correct} bonne(s) réponse(s) sur ${q.attempts} joueur(s) · ${q.noAnswer} sans réponse`}
                          />
                        </td>
                        <td className="py-3 pr-4 text-right tabular-nums text-gray-700">
                          {q.correct} / {q.attempts}
                        </td>
                        <td className="py-3 pr-4 text-right tabular-nums text-gray-700">{q.noAnswer}</td>
                        <td className="py-3 pr-4 text-right tabular-nums text-gray-700">{formatSeconds(q.avgTimeMs)}</td>
                        <td className="py-3 text-gray-700">
                          {q.topWrong ? (
                            <>
                              {q.topWrong.text}{' '}
                              <span className="text-gray-500">
                                ({q.topWrong.count} joueur{q.topWrong.count > 1 ? 's' : ''})
                              </span>
                            </>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Résultats par session et par joueur */}
            <section className="space-y-4">
              <h2 className="text-lg font-black text-gray-900">Résultats par session et par joueur</h2>
              {stats.sessions.map((s) => (
                <article key={s.sessionId} className="overflow-hidden rounded-2xl bg-white shadow">
                  <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-gray-100 bg-gray-50 px-5 py-3 text-sm">
                    <span className="font-black text-gray-900">{s.quizTitle}</span>
                    <span className="text-gray-600">{formatDate(s.date)}</span>
                    <span className="text-gray-600">PIN {s.pin}</span>
                    <span className="text-gray-600">
                      {s.players.length} joueur{s.players.length > 1 ? 's' : ''} · {s.questionsPlayed} question
                      {s.questionsPlayed > 1 ? 's' : ''} jouée{s.questionsPlayed > 1 ? 's' : ''}
                    </span>
                    {s.questionsPlayed === 0 && s.players.length > 0 && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-gray-600">
                        Aucune réponse enregistrée
                      </span>
                    )}
                    {s.inProgress && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">En cours</span>
                    )}
                    <span className="ml-auto font-bold text-gray-900">Réussite : {formatPercent(s.rate)}</span>
                  </header>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[36rem] text-left text-sm">
                      <thead>
                        <tr className="text-xs uppercase tracking-wide text-gray-500">
                          <th className="px-5 py-2 font-bold">Rang</th>
                          <th className="py-2 pr-4 font-bold">Joueur</th>
                          <th className="py-2 pr-4 text-right font-bold">Score</th>
                          <th className="py-2 pr-4 text-right font-bold">Bonnes réponses</th>
                          <th className="py-2 pr-5 font-bold">Taux de réussite</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.players.map((p, i) => (
                          <tr key={p.playerId} className="border-t border-gray-100">
                            <td className="px-5 py-2 font-bold text-violet-700">{i + 1}</td>
                            <td className="py-2 pr-4 font-semibold text-gray-900">{p.nickname}</td>
                            <td className="py-2 pr-4 text-right tabular-nums text-gray-700">{p.score}</td>
                            <td className="py-2 pr-4 text-right tabular-nums text-gray-700">
                              {p.correct} / {s.questionsPlayed}
                            </td>
                            <td className="py-2 pr-5">
                              {s.questionsPlayed === 0 ? (
                                <span className="text-gray-400" title="Aucune réponse enregistrée pour cette partie">
                                  —
                                </span>
                              ) : (
                                <RateBar
                                  rate={p.rate}
                                  detail={`${p.correct} bonne(s) réponse(s) sur ${s.questionsPlayed} · ${
                                    s.questionsPlayed - p.answered
                                  } sans réponse`}
                                />
                              )}
                            </td>
                          </tr>
                        ))}
                        {s.players.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-5 py-3 text-gray-500">
                              Aucun joueur.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </article>
              ))}
            </section>
          </>
        ) : null}
      </div>
    </main>
  )
}
