-- =====================================================================
-- Migration 003 — explication pédagogique affichée après chaque question
-- À exécuter une fois dans Supabase > SQL Editor. Ré-exécutable sans risque.
-- =====================================================================

-- Texte explicatif (facultatif)
alter table public.questions
  add column if not exists explanation_text text;

-- Image explicative (facultative) : URL http(s) ou image encodée (data:image/...;base64,...).
-- Les images importées sont redimensionnées et compressées par l'éditeur avant envoi.
alter table public.questions
  add column if not exists explanation_image text;

-- Garde-fous de taille (texte : 2 000 caractères ; image encodée : ~1,5 Mo)
alter table public.questions drop constraint if exists questions_explanation_text_length;
alter table public.questions
  add constraint questions_explanation_text_length
  check (explanation_text is null or char_length(explanation_text) <= 2000);

alter table public.questions drop constraint if exists questions_explanation_image_format;
alter table public.questions
  add constraint questions_explanation_image_format
  check (
    explanation_image is null
    or (
      char_length(explanation_image) <= 2000000
      and explanation_image ~ '^(https?://|data:image/(png|jpeg|webp|gif);base64,)'
    )
  );
