-- =====================================================================
-- Migration 005 — conservation de l'historique des parties
-- À exécuter une fois dans Supabase > SQL Editor. Ré-exécutable sans risque.
--
-- Problème : modifier ou supprimer une question déjà jouée effaçait (cascade)
-- ou dénaturait les réponses des anciennes parties.
-- Solution : une question qui a déjà reçu des réponses n'est jamais supprimée ni
-- réécrite. Elle est ARCHIVÉE (archived_at renseigné, position vide) et, si son
-- contenu change, une nouvelle version est créée. Les statistiques gardent donc
-- l'énoncé, les choix et la bonne réponse tels qu'ils étaient pendant la partie.
-- =====================================================================

-- 1. Archivage des questions
alter table public.questions add column if not exists archived_at timestamptz;
alter table public.questions alter column position drop not null;

alter table public.questions drop constraint if exists questions_position_archived;
alter table public.questions
  add constraint questions_position_archived
  check ((archived_at is null) = (position is not null));

-- 2. Les réponses ne sont acceptées que pour la question active en cours
create or replace function public.score_answer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  q          public.questions%rowtype;
  s          public.game_sessions%rowtype;
  elapsed_ms integer;
begin
  select * into q from public.questions where id = new.question_id;
  select * into s from public.game_sessions where id = new.session_id;

  if s.status is distinct from 'question' or s.question_started_at is null then
    raise exception 'Les réponses ne sont pas ouvertes pour cette partie';
  end if;

  if q.quiz_id is distinct from s.quiz_id
     or q.archived_at is not null
     or q.position is distinct from s.current_question_index then
    raise exception 'Cette question n''est pas la question en cours';
  end if;

  if not exists (
    select 1 from public.players p
    where p.id = new.player_id and p.session_id = new.session_id
  ) then
    raise exception 'Ce joueur ne fait pas partie de la partie';
  end if;

  elapsed_ms := greatest(0, (extract(epoch from (now() - s.question_started_at)) * 1000)::int);

  new.response_time_ms := elapsed_ms;
  new.is_correct       := (new.choice_index = q.correct_index)
                          and elapsed_ms <= q.time_limit * 1000 + 1000; -- 1 s de tolérance réseau
  new.points_awarded   := case
    when new.is_correct then
      round(q.points * (1 - least(elapsed_ms::numeric / (q.time_limit * 1000), 1) / 2))::int
    else 0
  end;

  return new;
end;
$$;

-- 3. Enregistrement d'un quiz qui préserve l'historique
create or replace function public.save_quiz(p_quiz_id uuid, p_title text, p_questions jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_quiz_id uuid := p_quiz_id;
  v_kept    uuid[];
  v_old     questions%rowtype;
  v_choices text[];
  v_correct smallint;
  r         record;
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

  select coalesce(array_agg((e->>'id')::uuid), '{}')
    into v_kept
    from jsonb_array_elements(p_questions) e
   where e->>'id' is not null;

  -- Questions retirées : archivées si déjà jouées (historique conservé), sinon supprimées
  for r in
    select id from questions
     where quiz_id = v_quiz_id and archived_at is null and not (id = any (v_kept))
  loop
    if exists (select 1 from answers where question_id = r.id) then
      update questions set archived_at = now(), position = null where id = r.id;
    else
      delete from questions where id = r.id;
    end if;
  end loop;

  -- Libère les positions 0..n pour pouvoir réordonner sans conflit d'unicité
  update questions set position = position + 100000
   where quiz_id = v_quiz_id and archived_at is null;

  for q in select value from jsonb_array_elements(p_questions) loop
    v_choices := array(select jsonb_array_elements_text(q->'choices'));
    v_correct := (q->>'correct_index')::smallint;

    if q->>'id' is not null then
      select * into v_old from questions
       where id = (q->>'id')::uuid and quiz_id = v_quiz_id and archived_at is null;
      if not found then
        raise exception 'Question introuvable dans ce quiz';
      end if;

      if exists (select 1 from answers where question_id = v_old.id)
         and (v_old.text is distinct from q->>'text'
              or v_old.choices is distinct from v_choices
              or v_old.correct_index is distinct from v_correct) then
        -- Question déjà jouée dont le contenu change : on archive l'ancienne version
        -- (les anciennes réponses gardent leur sens) et on crée la nouvelle.
        update questions set archived_at = now(), position = null where id = v_old.id;
        insert into questions
          (quiz_id, position, text, choices, correct_index, time_limit, explanation_text, explanation_image)
        values (v_quiz_id, i, q->>'text', v_choices, v_correct, (q->>'time_limit')::integer,
                nullif(q->>'explanation_text', ''), nullif(q->>'explanation_image', ''));
      else
        update questions set
          position          = i,
          text              = q->>'text',
          choices           = v_choices,
          correct_index     = v_correct,
          time_limit        = (q->>'time_limit')::integer,
          explanation_text  = nullif(q->>'explanation_text', ''),
          explanation_image = nullif(q->>'explanation_image', '')
        where id = v_old.id;
      end if;
    else
      insert into questions
        (quiz_id, position, text, choices, correct_index, time_limit, explanation_text, explanation_image)
      values (v_quiz_id, i, q->>'text', v_choices, v_correct, (q->>'time_limit')::integer,
              nullif(q->>'explanation_text', ''), nullif(q->>'explanation_image', ''));
    end if;
    i := i + 1;
  end loop;

  return v_quiz_id;
end;
$$;

grant execute on function public.save_quiz(uuid, text, jsonb) to anon, authenticated;

-- 4. Index utiles aux statistiques
create index if not exists answers_question_id_idx on public.answers(question_id);
create index if not exists game_sessions_quiz_id_idx on public.game_sessions(quiz_id);
