import AdminApp from './pages/AdminApp'
import ParticipantApp from './pages/ParticipantApp'
import { useHashRoute } from './lib/route'

// Deux interfaces séparées par l'URL :
//   /          → Participant (rejoindre une partie avec un PIN, aucun accès animateur)
//   /#/admin   → Animateur (code secret VITE_ADMIN_PIN demandé une fois par onglet)
export default function App() {
  const route = useHashRoute()
  return route === 'admin' ? <AdminApp key="admin" /> : <ParticipantApp key="participant" />
}
