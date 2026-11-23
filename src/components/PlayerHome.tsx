import { useState, type FormEvent } from 'react'
import { AlertTriangle, Gamepad2, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { GameSession, Player } from '../types/database'
import HomeLayout from './HomeLayout'

interface PlayerHomeProps {
  onJoined: (player: Player, session: GameSession) => void
  notice?: string | null // message affiché en haut (ex. joueur retiré de la partie)
}

// PIN transmis par le QR code de l'hôte : ?pin=123456
function pinFromUrl(): string {
  const pin = new URLSearchParams(window.location.search).get('pin') ?? ''
  return /^\d{6}$/.test(pin) ? pin : ''
}

// Retire ?pin= de l'adresse (le PIN d'une partie terminée ne doit pas être resservi)
function clearPinFromUrl() {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('pin')) return
  url.searchParams.delete('pin')
  window.history.replaceState(null, '', url.pathname + url.search + url.hash)
}

// Page publique des participants : uniquement « Rejoindre une partie », aucun accès animateur
export default function PlayerHome({ onJoined, notice }: PlayerHomeProps) {
  const [pin, setPin] = useState(pinFromUrl)
  const [nickname, setNickname] = useState('')
  const [joinError, setJoinError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)

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

      clearPinFromUrl()
      onJoined(player, session)
    } finally {
      setJoining(false)
    }
  }

  return (
    <HomeLayout subtitle="Le quiz en temps réel">
      {notice && (
        <p role="status" className="w-full rounded-2xl bg-amber-100 px-5 py-3 text-center font-bold text-amber-900 shadow">
          {notice}
        </p>
      )}
      <form onSubmit={(e) => void handleJoin(e)} className="w-full space-y-4 rounded-3xl bg-white p-6 shadow-2xl">
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
            autoFocus={pinValid} // PIN pré-rempli par le QR code : il ne reste que le pseudo
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
    </HomeLayout>
  )
}
