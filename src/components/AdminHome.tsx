import { BarChart3, PlusCircle } from 'lucide-react'
import type { GameSession } from '../types/database'
import HomeLayout from './HomeLayout'
import QuizList from './QuizList'

interface AdminHomeProps {
  onCreateQuiz: () => void
  onOpenStats: () => void
  onLaunched: (session: GameSession, quizTitle: string) => void
  onEditQuiz: (quizId: string) => void
}

// Espace Animateur (#/admin), affiché seulement après la saisie du code secret
export default function AdminHome({ onCreateQuiz, onOpenStats, onLaunched, onEditQuiz }: AdminHomeProps) {
  return (
    <HomeLayout subtitle="Espace animateur">
      <button
        type="button"
        onClick={onCreateQuiz}
        className="flex w-full items-center justify-center gap-3 rounded-3xl bg-amber-400 px-6 py-5 text-xl font-black text-gray-900 shadow-[0_6px_0_0_rgba(0,0,0,0.25)] transition hover:bg-amber-300 active:translate-y-1 active:shadow-none"
      >
        <PlusCircle className="h-7 w-7" />
        Créer un quiz
      </button>

      <button
        type="button"
        onClick={onOpenStats}
        className="-mt-4 flex w-full items-center justify-center gap-3 rounded-2xl bg-white/15 px-6 py-3 text-lg font-extrabold text-white ring-2 ring-white/40 transition hover:bg-white/25"
      >
        <BarChart3 className="h-6 w-6" />
        Statistiques
      </button>

      <QuizList onLaunched={onLaunched} onEdit={onEditQuiz} />
    </HomeLayout>
  )
}
