import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AlertTriangle, LockKeyhole, X } from 'lucide-react'
import { isAdminPinConfigured, tryUnlockAdmin } from '../lib/adminAuth'

interface AdminPinDialogProps {
  onSuccess: () => void
  onCancel: () => void
}

export default function AdminPinDialog({ onSuccess, onCancel }: AdminPinDialogProps) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const configured = isAdminPinConfigured()

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (tryUnlockAdmin(code)) {
      onSuccess()
    } else {
      setError('Code incorrect.')
      setCode('')
      inputRef.current?.focus()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel() // clic en dehors de la fenêtre
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-pin-title"
        onSubmit={handleSubmit}
        className="relative w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={onCancel}
          aria-label="Fermer"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-violet-100">
            <LockKeyhole className="h-7 w-7 text-violet-700" />
          </span>
          <h2 id="admin-pin-title" className="text-xl font-black text-gray-900">
            Espace animateur
          </h2>
          <p className="text-sm text-gray-600">Entre le code secret pour créer ou lancer un quiz.</p>
        </div>

        {configured ? (
          <>
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              aria-label="Code animateur"
              placeholder="••••"
              value={code}
              onChange={(e) => {
                setCode(e.target.value)
                setError(null)
              }}
              className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-center text-2xl font-black tracking-[0.4em] text-gray-900 placeholder:text-gray-300 focus:border-violet-500 focus:outline-none"
            />
            {error && (
              <p role="alert" className="flex items-center justify-center gap-2 text-sm font-bold text-red-700">
                <AlertTriangle className="h-4 w-4" />
                {error}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-xl border-2 border-gray-200 py-3 font-bold text-gray-700 hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={code.trim() === ''}
                className="rounded-xl bg-violet-600 py-3 font-black text-white hover:bg-violet-700 disabled:opacity-40"
              >
                Valider
              </button>
            </div>
          </>
        ) : (
          <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Le code animateur n'est pas configuré. Ajoute <code className="font-bold">VITE_ADMIN_PIN</code> dans{' '}
            <code className="font-bold">.env.local</code> (ou dans les variables de l'hébergeur), puis relance
            l'application.
          </p>
        )}
      </form>
    </div>
  )
}
