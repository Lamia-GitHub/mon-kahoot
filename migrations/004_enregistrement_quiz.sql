-- =====================================================================
-- Migration 004 — enregistrement d'un quiz en une seule opération
-- À exécuter une fois dans Supabase > SQL Editor. Ré-exécutable sans risque.
--
-- save_quiz crée un quiz (p_quiz_id = null) ou met à jour un quiz existant :
-- titre, questions modifiées, ajoutées, supprimées et réordonnées.
-- Tout se fait dans une seule transaction : en cas d'erreur, rien n'est modifié.
--
-- p_questions : tableau JSON ordonné de questions
--   { "id": uuid | null (null = nouvelle question), "text", "choices": [..],
--     "correct_index", "time_limit", "explanation_text", "explanation_image" }
-- =====================================================================

create or replace function public.save_quiz(p_quiz_id uuid, p_title text, p_questions jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_quiz_id uuid := p_quiz_id;
  v_kept    uuid[];
  q         jsonb;
  i         integer := 0;
begin
  if jsonb_typeof(p_questions) is distinct from 'array' or jsonb_array_length(p_questions) = 0 then
    raise exception 'Le quiz doit contenir au moins une question';
  end if;

  if v_quiz_id is null then
    insert into quizzes (title) values (trim(p_title)) returning id into v_quiz_id;
  else
    -- Modifier un quiz en cours de partie fausserait le jeu (questions, positions, réponses)
    if exists (select 1 from game_sessions where quiz_id = v_quiz_id and status <> 'finished') then
      raise exception 'Une partie utilisant ce quiz est en cours : termine-la (ou ferme le lobby) avant de le modifier';
    end if;
    update quizzes set title = trim(p_title) where id = v_quiz_id;
    if not found then
      raise exception 'Quiz introuvable (il a peut-être été supprimé)';
    end if;
  end if;

  -- Questions existantes conservées
  select coalesce(array_agg((e->>'id')::uuid), '{}')
    into v_kept
    from jsonb_array_elements(p_questions) e
   where e->>'id' is not null;

  -- Suppression des questions retirées (leurs anciennes réponses sont supprimées en cascade)
  delete from questions where quiz_id = v_quiz_id and not (id = any (v_kept));

  -- Libère les positions 0..n pour pouvoir réordonner sans conflit d'unicité
  update questions set position = position + 100000 where quiz_id = v_quiz_id;

  for q in select value from jsonb_array_elements(p_questions) loop
    if q->>'id' is not null then
      update questions set
        position          = i,
        text              = q->>'text',
        choices           = array(select jsonb_array_elements_text(q->'choices')),
        correct_index     = (q->>'correct_index')::smallint,
        time_limit        = (q->>'time_limit')::integer,
        explanation_text  = nullif(q->>'explanation_text', ''),
        explanation_image = nullif(q->>'explanation_image', '')
      where id = (q->>'id')::uuid and quiz_id = v_quiz_id;
      if not found then
        raise exception 'Question introuvable dans ce quiz';
      end if;
    else
      insert into questions
        (quiz_id, position, text, choices, correct_index, time_limit, explanation_text, explanation_image)
      values (
        v_quiz_id,
        i,
        q->>'text',
        array(select jsonb_array_elements_text(q->'choices')),
        (q->>'correct_index')::smallint,
        (q->>'time_limit')::integer,
        nullif(q->>'explanation_text', ''),
        nullif(q->>'explanation_image', '')
      );
    end if;
    i := i + 1;
  end loop;

  return v_quiz_id;
end;
$$;

grant execute on function public.save_quiz(uuid, text, jsonb) to anon, authenticated;
