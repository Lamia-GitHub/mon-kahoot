import { Circle, Diamond, Square, Triangle, type LucideIcon } from 'lucide-react'

// Les 4 couleurs/formes des réponses, dans l'ordre des choix (index 0 à 3)
export interface AnswerStyle {
  label: string
  icon: LucideIcon
  bg: string
  ring: string
}

export const ANSWER_STYLES: AnswerStyle[] = [
  { label: 'Rouge', icon: Triangle, bg: 'bg-red-600', ring: 'ring-red-300' },
  { label: 'Bleu', icon: Diamond, bg: 'bg-blue-600', ring: 'ring-blue-300' },
  { label: 'Jaune', icon: Circle, bg: 'bg-amber-500', ring: 'ring-amber-200' },
  { label: 'Vert', icon: Square, bg: 'bg-green-600', ring: 'ring-green-300' },
]

// Choix affichables d'une question : un choix vide ("") garde sa place dans le tableau
// pour que chaque réponse conserve sa couleur, mais il n'est pas affiché.
export function visibleChoices(choices: string[]): { text: string; index: number }[] {
  return choices.map((text, index) => ({ text, index })).filter((c) => c.text.trim() !== '')
}
