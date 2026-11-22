import type { PostgrestError } from '@supabase/supabase-js'

// Transforme une erreur Supabase en lignes lisibles pour l'interface
export function supabaseErrorDetails(error: PostgrestError): string[] {
  const details = [
    error.message && `Message : ${error.message}`,
    error.details && `Détails : ${error.details}`,
    error.hint && `Indice : ${error.hint}`,
    error.code && `Code : ${error.code}`,
  ].filter((d): d is string => Boolean(d))

  if (error.code === '42501') {
    details.push(
      "Supabase refuse l'opération (RLS). Vérifie que les politiques de schema.sql ont bien été créées.",
    )
  }
  return details
}
