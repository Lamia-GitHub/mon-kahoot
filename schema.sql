-- =====================================================================
-- Mon Kahoot — schéma Supabase
-- À exécuter une fois dans Supabase > SQL Editor (projet vierge).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Quiz et questions (contenu)
-- ---------------------------------------------------------------------

create table public.quizzes (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 200),
  description text,
  created_at  timestamptz not null default now()
);

create table public.questions (
  id            uuid primary key default gen_random_uuid(),
  quiz_id       uuid not null references public.quizzes(id) on delete cascade,
  position      integer check (position >= 0),                   -- ordre dans le quiz (0, 1, 2…) ; vide si archivée
  text          text not null check (char_length(text) between 1 and 500),
  choices       text[] not null check (array_length(choices, 1) between 2 and 4),
  correct_index smallint not null check (correct_index >= 0),    -- index dans choices (0-based)
  time_limit    integer not null default 20 check (time_limit between 5 and 240), -- secondes
  points        integer not null default 1000 check (points >= 0),
  image_url     text,
  -- Question archivée : déjà jouée puis modifiée ou retirée du quiz. Conservée pour l'historique
  -- et les statistiques, mais n'apparaît plus dans l'éditeur ni dans les nouvelles parties.
  archived_at   timestamptz,
  -- Explication affichée par l'hôte après la révélation de la réponse (facultative)
  explanation_text  text,
  explanation_image text,  -- URL http(s) ou image encodée data:image/...;base64 (redimensionnée par l'éditeur)
  created_at    timestamptz not null default now(),
  unique (quiz_id, position),
  check (correct_index < array_length(choices, 1)),
  constraint questions_position_archived check ((archived_at is null) = (position is not null)),
  constraint questions_explanation_text_length
    check (explanation_text is null or char_length(explanation_text) <= 2000),
  constraint questions_explanation_image_format
    check (
      explanation_image is null
      or (
        char_length(explanation_image) <= 2000000
        and explanation_image ~ '^(https?://|data:image/(png|jpeg|webp|gif);base64,)'
      )
    )
);

create index questions_quiz_id_idx on public.questions(quiz_id);

-- ---------------------------------------------------------------------
-- Parties (sessions de jeu avec code PIN)
-- ---------------------------------------------------------------------

-- Génère un PIN à 6 chiffres non utilisé par une partie en cours
create or replace function public.generate_game_pin()
returns text
language plpgsql
as $$
declare
  new_pin text;
begin
  loop
    new_pin := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (
      select 1 from public.game_sessions
      where pin = new_pin and status <> 'finished'
    );
  end loop;
  return new_pin;
end;
$$;

create table public.game_sessions (
  id                     uuid primary key default gen_random_uuid(),
  quiz_id                uuid not null references public.quizzes(id) on delete cascade,
  pin                    text not null default public.generate_game_pin()
                           check (pin ~ '^[0-9]{6}$'),
  -- lobby    : les joueurs rejoignent
  -- question : une question est affichée, les réponses sont ouvertes
  -- results  : affichage de la bonne réponse / classement intermédiaire
  -- finished : partie terminée
  status                 text not null default 'lobby'
                           check (status in ('lobby', 'question', 'results', 'finished')),
  current_question_index integer not null default -1,  -- -1 = aucune question encore affichée
  question_started_at    timestamptz,                  -- début de la question en cours (calcul du temps de réponse)
  created_at             timestamptz not null default now(),
  ended_at               timestamptz
);

-- Un PIN est unique parmi les parties non terminées
create index game_sessions_quiz_id_idx on public.game_sessions(quiz_id);

create unique index game_sessions_active_pin_idx
  on public.game_sessions(pin) where status <> 'finished';

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

-- ---------------------------------------------------------------------
-- Joueurs
-- ---------------------------------------------------------------------

create table public.players (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  nickname   text not null check (char_length(trim(nickname)) between 1 and 30),
  score      integer not null default 0,
  joined_at  timestamptz not null default now(),
  unique (session_id, nickname)
);

create index players_session_id_idx on public.players(session_id);

-- ---------------------------------------------------------------------
-- Réponses
-- ---------------------------------------------------------------------

create table public.answers (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references public.game_sessions(id) on delete cascade,
  player_id        uuid not null references public.players(id) on delete cascade,
  question_id      uuid not null references public.questions(id) on delete cascade,
  choice_index     smallint not null check (choice_index >= 0),
  -- Les champs ci-dessous sont calculés par le trigger (les valeurs envoyées par le client sont ignorées)
  is_correct       boolean not null default false,
  points_awarded   integer not null default 0,
  response_time_ms integer,
  created_at       timestamptz not null default now(),
  unique (player_id, question_id)  -- une seule réponse par joueur et par question
);

create index answers_session_question_idx on public.answers(session_id, question_id);
create index answers_question_id_idx on public.answers(question_id);

-- Calcule côté serveur la justesse, le temps de réponse et les points.
-- Barème façon Kahoot : bonne réponse = entre 50 % et 100 % des points selon la rapidité.
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

create trigger answers_score_before_insert
  before insert on public.answers
  for each row execute function public.score_answer();

-- Ajoute les points au score du joueur
create or replace function public.add_points_to_player()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.points_awarded > 0 then
    update public.players set score = score + new.points_awarded where id = new.player_id;
  end if;
  return new;
end;
$$;

create trigger answers_add_points_after_insert
  after insert on public.answers
  for each row execute function public.add_points_to_player();

-- ---------------------------------------------------------------------
-- Enregistrement d'un quiz (création ou modification) en une transaction
-- p_quiz_id = null : création ; sinon mise à jour du titre et des questions
-- (ajoutées / modifiées / supprimées / réordonnées). Refusé si une partie est en cours.
-- ---------------------------------------------------------------------

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

-- ---------------------------------------------------------------------
-- Sécurité (RLS)
-- L'application est 100 % statique et utilise la clé "anon" sans compte.
-- Politiques volontairement ouvertes pour le prototype : à restreindre
-- (ex. Supabase Auth pour les hôtes) avant une mise en production.
-- ---------------------------------------------------------------------

alter table public.quizzes       enable row level security;
alter table public.questions     enable row level security;
alter table public.game_sessions enable row level security;
alter table public.players       enable row level security;
alter table public.answers       enable row level security;

create policy "quizzes: accès public"       on public.quizzes       for all to anon, authenticated using (true) with check (true);
create policy "questions: accès public"     on public.questions     for all to anon, authenticated using (true) with check (true);
create policy "game_sessions: accès public" on public.game_sessions for all to anon, authenticated using (true) with check (true);
create policy "players: accès public"       on public.players       for all to anon, authenticated using (true) with check (true);

-- Réponses : lecture + insertion uniquement (pas de modification a posteriori)
create policy "answers: lecture publique"   on public.answers for select to anon, authenticated using (true);
create policy "answers: insertion publique" on public.answers for insert to anon, authenticated with check (true);

-- ---------------------------------------------------------------------
-- Realtime sur les tables de jeu
-- ---------------------------------------------------------------------

-- REPLICA IDENTITY FULL : les événements UPDATE/DELETE contiennent l'ancienne ligne complète
-- (nécessaire pour filtrer par session_id côté client).
alter table public.game_sessions replica identity full;
alter table public.players       replica identity full;
alter table public.answers       replica identity full;

alter publication supabase_realtime add table public.game_sessions;
alter publication supabase_realtime add table public.players;
alter publication supabase_realtime add table public.answers;
