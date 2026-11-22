// Protection simple de l'espace animateur (créer / lancer / supprimer un quiz).
//
// ⚠️ L'application est 100 % statique : VITE_ADMIN_PIN est intégré au code JavaScript
// envoyé au navigateur. C'est un garde-fou contre les clics involontaires, pas une
// vraie sécurité (une personne motivée peut lire le code ou appeler Supabase directement).

const STORAGE_KEY = 'mon-kahoot:admin-pin'

export const ADMIN_PIN: string = (import.meta.env.VITE_ADMIN_PIN ?? '').trim()

export function isAdminPinConfigured(): boolean {
  return ADMIN_PIN !== ''
}

// Vrai si le code a déjà été saisi dans cet onglet (sessionStorage : effacé à la fermeture).
// On compare avec le code actuel : si VITE_ADMIN_PIN change, il est redemandé.
export function isAdminUnlocked(): boolean {
  if (!isAdminPinConfigured()) return false
  try {
    return sessionStorage.getItem(STORAGE_KEY) === ADMIN_PIN
  } catch {
    return false
  }
}

export function tryUnlockAdmin(code: string): boolean {
  if (!isAdminPinConfigured() || code.trim() !== ADMIN_PIN) return false
  try {
    sessionStorage.setItem(STORAGE_KEY, ADMIN_PIN)
  } catch {
    // sessionStorage indisponible (navigation privée stricte) : le code sera redemandé
  }
  return true
}
