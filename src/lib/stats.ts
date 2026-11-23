// Statistiques pédagogiques : chargement de l'historique, calculs et export CSV.
// Tout est calculé dans le navigateur (hébergement statique, pas de serveur).

import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { GameStatus } from '../types/database'

// ------------------------------------------------------------------ Données brutes

export interface StatsQuiz {
  id: string
  title: string
}
export interface StatsSession {
  id: string
  quiz_id: string
  pin: string
  status: GameStatus
  current_question_index: number
  created_at: string
}
export interface StatsPlayer {
  id: string
  session_id: string
  nickname: string
  score: number
}
export interface StatsQuestion {
  id: string
  quiz_id: string
  text: string
  choices: string[]
  correct_index: number
  archived_at: string | null
}
export interface StatsAnswer {
  session_id: string
  player_id: string
  question_id: string
  choice_index: number
  is_correct: boolean
  points_awarded: number
  response_time_ms: number | null
  created_at: string
}

export interface StatsData {
  quizzes: StatsQuiz[]
  sessions: StatsSession[] // uniquement les parties réellement démarrées
  players: StatsPlayer[]
  questions: StatsQuestion[] // y compris les versions archivées (historique)
  answers: StatsAnswer[]
}

const PAGE_SIZE = 1000 // limite par requête de Supabase

// Charge toutes les lignes d'une requête, page par page
async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

export async function loadStatsData(): Promise<StatsData> {
  const [quizzes, sessions, players, questions, answers] = await Promise.all([
    fetchAllRows<StatsQuiz>((a, b) => supabase.from('quizzes').select('id, title').order('id').range(a, b)),
    fetchAllRows<StatsSession>((a, b) =>
      supabase
        .from('game_sessions')
        .select('id, quiz_id, pin, status, current_question_index, created_at')
        .gte('current_question_index', 0) // ignore les lobbys fermés sans avoir joué
        .order('id')
        .range(a, b),
    ),
    fetchAllRows<StatsPlayer>((a, b) =>
      supabase.from('players').select('id, session_id, nickname, score').order('id').range(a, b),
    ),
    // Pas d'images d'explication ici : inutiles pour les statistiques et lourdes
    fetchAllRows<StatsQuestion>((a, b) =>
      supabase
        .from('questions')
        .select('id, quiz_id, text, choices, correct_index, archived_at')
        .order('id')
        .range(a, b),
    ),
    fetchAllRows<StatsAnswer>((a, b) =>
      supabase
        .from('answers')
        .select('session_id, player_id, question_id, choice_index, is_correct, points_awarded, response_time_ms, created_at')
        .order('id')
        .range(a, b),
    ),
  ])
  return { quizzes, sessions, players, questions, answers }
}

// ------------------------------------------------------------------ Calculs

export interface StatsFilter {
  quizId: string | null // null = tous les quiz
  sessionId: string | null // null = toutes les sessions
}

export type MasteryLevel = 'weak' | 'medium' | 'strong'

// Seuils pédagogiques : < 50 % à renforcer, 50–75 % à consolider, ≥ 75 % maîtrisé
export function masteryLevel(rate: number): MasteryLevel {
  if (rate < 0.5) return 'weak'
  if (rate < 0.75) return 'medium'
  return 'strong'
}

export interface QuestionStat {
  questionId: string
  quizTitle: string
  text: string
  correctAnswer: string
  archived: boolean
  attempts: number // joueurs ayant eu la question (réponse ou non)
  answered: number
  correct: number
  noAnswer: number
  rate: number // correct / attempts
  avgTimeMs: number | null
  topWrong: { text: string; count: number } | null // erreur la plus fréquente
}

export interface PlayerResult {
  playerId: string
  nickname: string
  score: number
  correct: number
  answered: number
  rate: number // correct / questions jouées
}

export interface SessionResult {
  sessionId: string
  quizTitle: string
  date: string
  pin: string
  inProgress: boolean
  questionsPlayed: number
  rate: number | null
  players: PlayerResult[]
}

export interface StatsSummary {
  sessionsCount: number
  participants: number
  successRate: number | null
  avgTimeMs: number | null
  questions: QuestionStat[]
  sessions: SessionResult[]
}

function filterData(data: StatsData, filter: StatsFilter) {
  const sessions = data.sessions
    .filter((s) => (!filter.quizId || s.quiz_id === filter.quizId) && (!filter.sessionId || s.id === filter.sessionId))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  const ids = new Set(sessions.map((s) => s.id))
  return {
    sessions,
    players: data.players.filter((p) => ids.has(p.session_id)),
    answers: data.answers.filter((a) => ids.has(a.session_id)),
  }
}

// Questions jouées dans une session, dans l'ordre où elles ont été posées
function playedQuestionIds(answers: StatsAnswer[]): string[] {
  const first = new Map<string, string>()
  for (const a of answers) {
    const t = first.get(a.question_id)
    if (!t || a.created_at < t) first.set(a.question_id, a.created_at)
  }
  return [...first.entries()].sort((x, y) => x[1].localeCompare(y[1])).map(([id]) => id)
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const list = map.get(k)
    if (list) list.push(item)
    else map.set(k, [item])
  }
  return map
}

export function computeStats(data: StatsData, filter: StatsFilter): StatsSummary {
  const { sessions, players, answers } = filterData(data, filter)
  const quizTitle = new Map(data.quizzes.map((q) => [q.id, q.title]))
  const questionById = new Map(data.questions.map((q) => [q.id, q]))
  const playersBySession = groupBy(players, (p) => p.session_id)
  const answersBySession = groupBy(answers, (a) => a.session_id)

  // Une question sans réponse compte comme non réussie : le dénominateur est le nombre
  // de joueurs présents dans la partie où la question a été posée.
  const perQuestion = new Map<string, { attempts: number; answers: StatsAnswer[] }>()
  const sessionResults: SessionResult[] = []
  let totalAttempts = 0
  let totalCorrect = 0

  for (const s of sessions) {
    const sPlayers = playersBySession.get(s.id) ?? []
    const sAnswers = answersBySession.get(s.id) ?? []
    const played = playedQuestionIds(sAnswers)

    for (const qid of played) {
      const entry = perQuestion.get(qid) ?? { attempts: 0, answers: [] }
      entry.attempts += sPlayers.length
      perQuestion.set(qid, entry)
    }
    for (const a of sAnswers) perQuestion.get(a.question_id)?.answers.push(a)

    const byPlayer = groupBy(sAnswers, (a) => a.player_id)
    const results: PlayerResult[] = sPlayers
      .map((p) => {
        const pa = byPlayer.get(p.id) ?? []
        const correct = pa.filter((a) => a.is_correct).length
        return {
          playerId: p.id,
          nickname: p.nickname,
          score: p.score,
          correct,
          answered: pa.length,
          rate: played.length > 0 ? correct / played.length : 0,
        }
      })
      .sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname))

    const sCorrect = results.reduce((n, r) => n + r.correct, 0)
    const sAttempts = sPlayers.length * played.length
    totalCorrect += sCorrect
    totalAttempts += sAttempts

    sessionResults.push({
      sessionId: s.id,
      quizTitle: quizTitle.get(s.quiz_id) ?? 'Quiz supprimé',
      date: s.created_at,
      pin: s.pin,
      inProgress: s.status !== 'finished',
      questionsPlayed: played.length,
      rate: sAttempts > 0 ? sCorrect / sAttempts : null,
      players: results,
    })
  }

  const questionStats: QuestionStat[] = []
  for (const [qid, { attempts, answers: qAnswers }] of perQuestion) {
    const q = questionById.get(qid)
    if (!q || attempts === 0) continue
    const correct = qAnswers.filter((a) => a.is_correct).length
    const times = qAnswers.map((a) => a.response_time_ms).filter((t): t is number => t !== null)

    const wrongCounts = new Map<number, number>()
    for (const a of qAnswers) {
      if (a.choice_index !== q.correct_index) wrongCounts.set(a.choice_index, (wrongCounts.get(a.choice_index) ?? 0) + 1)
    }
    const [wrongIndex, wrongCount] = [...wrongCounts.entries()].sort((x, y) => y[1] - x[1])[0] ?? [null, 0]

    questionStats.push({
      questionId: qid,
      quizTitle: quizTitle.get(q.quiz_id) ?? 'Quiz supprimé',
      text: q.text,
      correctAnswer: q.choices[q.correct_index] ?? '',
      archived: q.archived_at !== null,
      attempts,
      answered: qAnswers.length,
      correct,
      noAnswer: Math.max(0, attempts - qAnswers.length),
      rate: correct / attempts,
      avgTimeMs: times.length > 0 ? times.reduce((x, y) => x + y, 0) / times.length : null,
      topWrong: wrongIndex !== null ? { text: q.choices[wrongIndex] ?? '?', count: wrongCount } : null,
    })
  }
  // Points faibles d'abord (besoins de formation), à égalité les plus joués d'abord
  questionStats.sort((a, b) => a.rate - b.rate || b.attempts - a.attempts)

  const allTimes = answers.map((a) => a.response_time_ms).filter((t): t is number => t !== null)

  return {
    sessionsCount: sessions.length,
    participants: players.length,
    successRate: totalAttempts > 0 ? totalCorrect / totalAttempts : null,
    avgTimeMs: allTimes.length > 0 ? allTimes.reduce((x, y) => x + y, 0) / allTimes.length : null,
    questions: questionStats,
    sessions: sessionResults,
  }
}

// ------------------------------------------------------------------ Formatage

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

export function formatPercent(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)} %`
}

export function formatSeconds(ms: number | null): string {
  return ms === null ? '—' : `${(ms / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s`
}

// ------------------------------------------------------------------ Export CSV (Excel)

// Cellule CSV : neutralise les formules (=, +, -, @) et échappe les guillemets
function csvCell(value: string | number): string {
  let text = String(value)
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export function buildCsv(data: StatsData, filter: StatsFilter): string {
  const { sessions, players, answers } = filterData(data, filter)
  const quizTitle = new Map(data.quizzes.map((q) => [q.id, q.title]))
  const questionById = new Map(data.questions.map((q) => [q.id, q]))
  const playersBySession = groupBy(players, (p) => p.session_id)
  const answersBySession = groupBy(answers, (a) => a.session_id)

  const header = [
    'Quiz',
    'Date de session',
    'PIN',
    'Participant',
    'Question',
    'Réponse choisie',
    'Statut',
    'Temps de réponse (s)',
    'Points',
  ]
  const lines = [header.map(csvCell).join(';')]

  // Sessions de la plus ancienne à la plus récente : plus naturel dans un tableur
  for (const s of [...sessions].reverse()) {
    const sAnswers = answersBySession.get(s.id) ?? []
    const played = playedQuestionIds(sAnswers)
    const answerOf = new Map(sAnswers.map((a) => [`${a.player_id}|${a.question_id}`, a]))
    const sPlayers = [...(playersBySession.get(s.id) ?? [])].sort((a, b) => a.nickname.localeCompare(b.nickname))

    for (const p of sPlayers) {
      for (const qid of played) {
        const q = questionById.get(qid)
        const a = answerOf.get(`${p.id}|${qid}`)
        lines.push(
          [
            csvCell(quizTitle.get(s.quiz_id) ?? 'Quiz supprimé'),
            csvCell(formatDate(s.created_at)),
            // ="…" : Excel garde le PIN en texte (sans perdre un éventuel 0 initial)
            `"=""${s.pin}"""`,
            csvCell(p.nickname),
            csvCell(q?.text ?? '?'),
            csvCell(a ? (q?.choices[a.choice_index] ?? `Choix ${a.choice_index + 1}`) : '(pas de réponse)'),
            csvCell(a?.is_correct ? 'Correct' : 'Incorrect'),
            // Virgule décimale : lu comme un nombre par Excel en français
            csvCell(a?.response_time_ms != null ? (a.response_time_ms / 1000).toFixed(1).replace('.', ',') : ''),
            csvCell(a?.points_awarded ?? 0),
          ].join(';'),
        )
      }
    }
  }
  // BOM UTF-8 : Excel affiche correctement les accents ; CRLF : fins de ligne Windows
  return '﻿' + lines.join('\r\n') + '\r\n'
}

export function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
