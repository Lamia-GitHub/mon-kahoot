// Types de la base Supabase — à garder synchronisés avec schema.sql
// (peut être régénéré avec : npx supabase gen types typescript --project-id <id>)

export type GameStatus = 'lobby' | 'question' | 'results' | 'finished'

// Question envoyée à la fonction save_quiz (id null = nouvelle question)
export interface SaveQuizQuestion {
  id: string | null
  text: string
  choices: string[]
  correct_index: number
  time_limit: number
  explanation_text: string | null
  explanation_image: string | null
}

export interface Database {
  public: {
    Tables: {
      quizzes: {
        Row: {
          id: string
          title: string
          description: string | null
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['quizzes']['Insert']>
        Relationships: []
      }
      questions: {
        Row: {
          id: string
          quiz_id: string
          position: number | null // null = question archivée
          text: string
          choices: string[]
          correct_index: number
          time_limit: number
          points: number
          image_url: string | null
          explanation_text: string | null
          explanation_image: string | null
          archived_at: string | null // déjà jouée puis modifiée / retirée : conservée pour l'historique
          created_at: string
        }
        Insert: {
          id?: string
          quiz_id: string
          position?: number | null
          text: string
          choices: string[]
          correct_index: number
          time_limit?: number
          points?: number
          image_url?: string | null
          explanation_text?: string | null
          explanation_image?: string | null
          archived_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['questions']['Insert']>
        Relationships: [
          { foreignKeyName: 'questions_quiz_id_fkey'; columns: ['quiz_id']; isOneToOne: false; referencedRelation: 'quizzes'; referencedColumns: ['id'] },
        ]
      }
      game_sessions: {
        Row: {
          id: string
          quiz_id: string
          pin: string
          status: GameStatus
          current_question_index: number
          question_started_at: string | null
          created_at: string
          ended_at: string | null
        }
        Insert: {
          id?: string
          quiz_id: string
          pin?: string
          status?: GameStatus
          current_question_index?: number
          question_started_at?: string | null
          created_at?: string
          ended_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['game_sessions']['Insert']>
        Relationships: [
          { foreignKeyName: 'game_sessions_quiz_id_fkey'; columns: ['quiz_id']; isOneToOne: false; referencedRelation: 'quizzes'; referencedColumns: ['id'] },
        ]
      }
      players: {
        Row: {
          id: string
          session_id: string
          nickname: string
          score: number
          joined_at: string
        }
        Insert: {
          id?: string
          session_id: string
          nickname: string
          score?: number
          joined_at?: string
        }
        Update: Partial<Database['public']['Tables']['players']['Insert']>
        Relationships: [
          { foreignKeyName: 'players_session_id_fkey'; columns: ['session_id']; isOneToOne: false; referencedRelation: 'game_sessions'; referencedColumns: ['id'] },
        ]
      }
      answers: {
        Row: {
          id: string
          session_id: string
          player_id: string
          question_id: string
          choice_index: number
          is_correct: boolean
          points_awarded: number
          response_time_ms: number | null
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          player_id: string
          question_id: string
          choice_index: number
        }
        Update: Record<string, never>
        Relationships: [
          { foreignKeyName: 'answers_session_id_fkey'; columns: ['session_id']; isOneToOne: false; referencedRelation: 'game_sessions'; referencedColumns: ['id'] },
          { foreignKeyName: 'answers_player_id_fkey'; columns: ['player_id']; isOneToOne: false; referencedRelation: 'players'; referencedColumns: ['id'] },
          { foreignKeyName: 'answers_question_id_fkey'; columns: ['question_id']; isOneToOne: false; referencedRelation: 'questions'; referencedColumns: ['id'] },
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      generate_game_pin: { Args: Record<string, never>; Returns: string }
      save_quiz: {
        Args: { p_quiz_id: string | null; p_title: string; p_questions: SaveQuizQuestion[] }
        Returns: string
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type Quiz = Tables<'quizzes'>
export type Question = Tables<'questions'>
export type GameSession = Tables<'game_sessions'>
export type Player = Tables<'players'>
export type Answer = Tables<'answers'>
