import type { ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { ANSWER_STYLES } from '../lib/answerStyles'

interface HomeLayoutProps {
  subtitle: string
  children?: ReactNode
}

// Fond coloré, formes décoratives et logo communs aux pages d'accueil Participant et Animateur
export default function HomeLayout({ subtitle, children }: HomeLayoutProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-violet-800 via-purple-700 to-fuchsia-600 px-4 py-10">
      <div className="pointer-events-none absolute inset-0 opacity-20">
        {ANSWER_STYLES.map(({ icon: Icon, label }, i) => (
          <Icon
            key={label}
            className={[
              'absolute h-32 w-32 text-white',
              ['left-[5%] top-[8%] rotate-12', 'right-[8%] top-[15%] -rotate-12', 'left-[10%] top-[70%]', 'right-[5%] top-[85%] rotate-45'][i],
            ].join(' ')}
            strokeWidth={1.5}
          />
        ))}
      </div>

      <div className="relative mx-auto flex max-w-md flex-col items-center gap-8">
        <header className="text-center text-white">
          <h1 className="flex items-center justify-center gap-2 text-5xl font-black tracking-tight drop-shadow-lg">
            <Sparkles className="h-10 w-10 text-amber-300" />
            Mon Kahoot
          </h1>
          <p className="mt-2 text-lg font-medium text-white/85">{subtitle}</p>
        </header>
        {children}
      </div>
    </main>
  )
}
