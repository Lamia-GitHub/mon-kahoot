import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, Play, Users, Wifi, WifiOff, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { supabaseErrorDetails } from '../lib/errors'
import type { GameSession, Player } from '../types/database'

const CHIP_COLORS = ['bg-red-600', 'bg-blue-600', 'bg-amber-500', 'bg-green-600']

// Couleur stable pour un joueur (ne change pas quand un autre joueur part)
function chipColor(playerId: string): string {
  let hash = 0
  for (const char of playerId) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return CHIP_COLORS[Math.abs(hash) % CHIP_COLORS.length]
}

type RealtimeState = 'connecting' | 'connected' | 'error'

interface HostLobbyProps {
  session: GameSession
  quizTitle: string
  onExit: () => void
  onStarted: (session: GameSession) => void
}

// Ajoute/remplace des joueurs dans la liste, triée par ordre d'arrivée
function mergePlayers(current: Player[], incoming: Player[]): Player[] {
  const byId = new Map(current.map((p) => [p.id, p]))
  incoming.forEach((p) => byId.set(p.id, p))
  return [...byId.values()].sort((a, b) => a.joined_at.localeCompare(b.joined_at))
}

export default function HostLobby({ session, quizTitle, onExit, onStarted }: HostLobbyProps) {
  const [players, setPlayers] = useState<Player[]>([])
  const [realtime, setRealtime] = useState<RealtimeState>('connecting')
  const [error, setError] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false

    // Nom de canal unique : évite les conflits si le composant est monté deux fois (StrictMode)
    const channel = supabase
      .channel(`host-lobby-${session.id}-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'players', filter: `session_id=eq.${session.id}` },
        (payload) => setPlayers((ps) => mergePlayers(ps, [payload.new as Player])),
      )
      .on(
        // Les événements DELETE ne peuvent pas être filtrés par Supabase : on filtre par id côté client
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'players' },
        (payload) => {
          const removedId = (payload.old as Partial<Player>).id
          setPlayers((ps) => ps.filter((p) => p.id !== removedId))
        },
      )
      .subscribe(async (status) => {
        if (cancelled) return
        if (status === 'SUBSCRIBED') {
          setRealtime('connected')
          // Charge les joueurs déjà présents (ceux arrivés avant l'abonnement)
          const { data, error } = await supabase
            .from('players')
            .select('*')
            .eq('session_id', session.id)
          if (cancelled) return
          if (error) setError(['Impossible de charger les joueurs.', ...supabaseErrorDetails(error)])
          else setPlayers((ps) => mergePlayers(ps, data))
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRealtime('error')
        }
      })

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [session.id])

  async function handleStart() {
    setBusy(true)
    setError(null)
    // Supabase fixe lui-même l'heure de début de la question (trigger)
    const { data, error } = await supabase
      .from('game_sessions')
      .update({ status: 'question', current_question_index: 0 })
      .eq('id', session.id)
      .select('*')
      .single()
    setBusy(false)
    if (error) {
      setError(['Impossible de démarrer la partie.', ...supabaseErrorDetails(error)])
      return
    }
    onStarted(data)
  }

  async function handleCancel() {
    if (players.length > 0 && !window.confirm('Fermer la partie ? Les joueurs seront déconnectés.')) {
      return
    }
    setBusy(true)
    // Libère le PIN : une partie "finished" n'est plus joignable
    const { error } = await supabase
      .from('game_sessions')
      .update({ status: 'finished', ended_at: new Date().toISOString() })
      .eq('id', session.id)
    setBusy(false)
    if (error) {
      setError(['Impossible de fermer la partie.', ...supabaseErrorDetails(error)])
      return
    }
    onExit()
  }

  const joinUrl = `${window.location.origin}${window.location.pathname}`

  return (
    <main className="flex min-h-screen flex-col bg-gradient-to-br from-violet-800 via-purple-700 to-fuchsia-600 text-white">
      {/* Bandeau PIN */}
      <header className="bg-white text-gray-900 shadow-xl">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 py-6 sm:flex-row sm:justify-between">
          <div className="text-center sm:text-left">
            <p className="text-sm font-semibold uppercase tracking-wider text-gray-500">
              Rejoins sur <span className="normal-case tracking-normal text-violet-700">{joinUrl}</span>
            </p>
            <p className="text-lg font-bold text-gray-700">{quizTitle}</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold uppercase tracking-wider text-gray-500">Code PIN</p>
            <p
              className="font-black leading-none tracking-[0.12em] text-gray-900 text-7xl sm:text-8xl"
              data-testid="game-pin"
            >
              {session.pin}
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6">
        {/* Barre d'actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 rounded-full bg-black/25 px-4 py-2 text-lg font-extrabold">
              <Users className="h-5 w-5" />
              {players.length} joueur{players.length > 1 ? 's' : ''}
            </span>
            <span
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${
                realtime === 'connected'
                  ? 'bg-green-500/25 text-green-100'
                  : realtime === 'error'
                    ? 'bg-red-500/30 text-red-100'
                    : 'bg-white/15 text-white/80'
              }`}
            >
              {realtime === 'error' ? <WifiOff className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}
              {realtime === 'connected' ? 'En direct' : realtime === 'error' ? 'Temps réel indisponible' : 'Connexion…'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleCancel()}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-xl px-4 py-3 font-bold text-white/85 hover:bg-white/15 disabled:opacity-50"
            >
              <X className="h-5 w-5" />
              Fermer
            </button>
            <button
              type="button"
              onClick={() => void handleStart()}
              disabled={busy || players.length === 0}
              title={players.length === 0 ? 'Attends qu’au moins un joueur rejoigne' : undefined}
              className="flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-lg font-black text-violet-700 shadow-[0_5px_0_0_rgba(0,0,0,0.25)] hover:bg-violet-50 active:translate-y-1 active:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5 fill-violet-700" />}
              Démarrer la partie
            </button>
          </div>
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


        {/* Joueurs */}
        {players.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-white/80">
            <Loader2 className="h-10 w-10 animate-spin" />
            <p className="text-xl font-bold">En attente des joueurs…</p>
          </div>
        ) : (
          <ul className="flex flex-wrap justify-center gap-3" aria-label="Joueurs connectés">
            {players.map((p) => (
              <li
                key={p.id}
                className={`animate-[pop_0.3s_ease-out] rounded-xl ${chipColor(p.id)} px-5 py-3 text-xl font-extrabold shadow-[0_4px_0_0_rgba(0,0,0,0.25)]`}
              >
                {p.nickname}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
