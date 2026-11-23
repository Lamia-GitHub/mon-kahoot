import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, DoorOpen, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { onPageVisible } from '../lib/gameStorage'
import type { GameSession, Player } from '../types/database'

export const KICKED_MESSAGE = "Tu as été retiré de la salle d'attente par l'animateur."

interface PlayerLobbyProps {
  player: Player
  session: GameSession
  onLeave: (notice?: string) => void
  onStarted: (session: GameSession) => void
}

export default function PlayerLobby({ player, session, onLeave, onStarted }: PlayerLobbyProps) {
  const [closed, setClosed] = useState(session.status === 'finished')
  const [leaving, setLeaving] = useState(false)

  // Références vers les derniers callbacks, pour ne pas se réabonner à chaque rendu
  const onStartedRef = useRef(onStarted)
  const onLeaveRef = useRef(onLeave)
  useEffect(() => {
    onStartedRef.current = onStarted
    onLeaveRef.current = onLeave
  })

  // Suit en direct la partie (démarrage / fermeture) et sa propre présence (éjection par l'hôte)
  useEffect(() => {
    let cancelled = false

    function handle(s: GameSession) {
      if (cancelled) return
      if (s.status === 'finished') setClosed(true)
      else if (s.status !== 'lobby') onStartedRef.current(s)
    }

    function kicked() {
      if (!cancelled) onLeaveRef.current(KICKED_MESSAGE)
    }

    // Vérifie l'état réel (après abonnement, ou au retour sur l'onglet / déverrouillage du téléphone)
    async function refresh() {
      const [{ data: s }, { data: me, error: meError }] = await Promise.all([
        supabase.from('game_sessions').select('*').eq('id', session.id).single(),
        supabase.from('players').select('id').eq('id', player.id).maybeSingle(),
      ])
      if (cancelled) return
      if (!meError && !me) return kicked()
      if (s) handle(s)
    }

    const channel = supabase
      .channel(`player-lobby-${session.id}-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${session.id}` },
        (payload) => handle(payload.new as GameSession),
      )
      .on(
        // Les DELETE ne sont pas filtrables côté Supabase : on compare l'id reçu
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'players' },
        (payload) => {
          if ((payload.old as Partial<Player>).id === player.id) kicked()
        },
      )
      .subscribe((s) => {
        if (s === 'SUBSCRIBED' && !cancelled) void refresh()
      })

    const stopVisible = onPageVisible(() => void refresh())

    return () => {
      cancelled = true
      stopVisible()
      void supabase.removeChannel(channel)
    }
  }, [session.id, player.id])

  async function handleLeave() {
    setLeaving(true)
    // Retire le joueur de la partie : il disparaît en direct de l'écran de l'hôte
    if (!closed) {
      await supabase.from('players').delete().eq('id', player.id)
    }
    onLeave()
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gradient-to-br from-violet-800 via-purple-700 to-fuchsia-600 p-6 text-center text-white">
      <p className="rounded-full bg-black/25 px-4 py-1.5 text-sm font-bold tracking-wider">
        PIN {session.pin}
      </p>

      {closed ? (
        <>
          <DoorOpen className="h-20 w-20 text-white/80" />
          <h1 className="text-3xl font-black">L'hôte a fermé la partie</h1>
        </>
      ) : (
        <>
          <CheckCircle2 className="h-20 w-20 text-green-300" />
          <div className="space-y-3">
            <h1 className="text-4xl font-black">Tu es inscrit !</h1>
            <p className="text-xl font-medium text-white/90">Regarde ton pseudo sur l'écran principal</p>
          </div>
          <p className="rounded-2xl bg-white px-8 py-4 text-3xl font-black text-violet-700 shadow-[0_6px_0_0_rgba(0,0,0,0.25)]">
            {player.nickname}
          </p>
          <p className="flex items-center gap-2 text-white/80">
            <Loader2 className="h-5 w-5 animate-spin" />
            En attente du lancement par l'hôte…
          </p>
        </>
      )}

      <button
        type="button"
        onClick={() => void handleLeave()}
        disabled={leaving}
        className="rounded-xl px-5 py-2 font-bold text-white/80 ring-2 ring-white/40 hover:bg-white/15 disabled:opacity-50"
      >
        {closed ? "Retour à l'accueil" : 'Quitter'}
      </button>
    </main>
  )
}
