-- =====================================================================
-- Migration 002 — chronomètre des questions géré par Supabase
-- À exécuter une fois dans Supabase > SQL Editor (base créée avec schema.sql v1).
-- Ré-exécutable sans risque.
-- =====================================================================

-- 1. Heure de début des questions fixée par le serveur (pas par l'horloge de l'hôte)
--    Dès qu'une partie passe au statut 'question' ou change de question,
--    question_started_at reçoit now() côté Supabase.
create or replace function public.set_question_started_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'question' and (
       tg_op = 'INSERT'
       or old.status is distinct from 'question'
       or new.current_question_index is distinct from old.current_question_index
     ) then
    new.question_started_at := now();
  elsif new.status <> 'question' and tg_op = 'UPDATE' then
    -- On garde l'heure de début de la dernière question (utile pour l'historique)
    new.question_started_at := old.question_started_at;
  end if;
  return new;
end;
$$;

drop trigger if exists game_sessions_question_started_at on public.game_sessions;
create trigger game_sessions_question_started_at
  before insert or update on public.game_sessions
  for each row execute function public.set_question_started_at();

-- 2. Calcul des points renforcé : la réponse doit porter sur la question en cours
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

  if q.quiz_id is distinct from s.quiz_id or q.position <> s.current_question_index then
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
