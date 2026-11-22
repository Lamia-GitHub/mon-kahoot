import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

// trim() : tolère un espace ou un retour à la ligne collé par erreur dans un secret
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Variables VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY manquantes (voir .env.example).',
  )
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
