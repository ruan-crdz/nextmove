alter table public.applications
  add column auto_submit boolean not null default false;

alter table public.application_runs
  add column openai_session_id text,
  add column current_turn_id text,
  add column last_activity_at timestamptz,
  add column dispatch_key uuid not null default gen_random_uuid();

create unique index application_runs_openai_session_unique
  on public.application_runs (openai_session_id)
  where openai_session_id is not null;
create unique index application_runs_dispatch_key_unique
  on public.application_runs (dispatch_key);

alter table public.approval_requests
  add column request_type text not null default 'question',
  add column openai_request_id text,
  add column openai_call_id text,
  add column openai_turn_id text,
  add column request_payload jsonb not null default '{}'::jsonb;

create unique index approval_requests_openai_request_unique
  on public.approval_requests (openai_request_id)
  where openai_request_id is not null;

create table public.openai_webhook_events (
  id text primary key,
  event_type text not null,
  session_id text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text
);
alter table public.openai_webhook_events enable row level security;

create or replace function public.reserve_application_run(p_application_id uuid, p_user_id uuid)
returns setof public.application_runs
language sql
security definer
set search_path = ''
as $$
  update public.application_runs
  set status = 'dispatching',
      started_at = coalesce(started_at, now()),
      last_activity_at = now()
  where id = (
    select id from public.application_runs
    where application_id = p_application_id
      and user_id = p_user_id
      and status = 'queued'
    order by created_at desc
    limit 1
    for update skip locked
  )
  returning *;
$$;
revoke all on function public.reserve_application_run(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_application_run(uuid, uuid) to service_role;

create or replace function public.ack_application_run(p_run_id uuid, p_user_id uuid, p_openai_session_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_run public.application_runs%rowtype;
begin
  update public.application_runs
    set status = 'running', openai_session_id = p_openai_session_id, last_activity_at = now()
    where id = p_run_id and user_id = p_user_id and status = 'dispatching'
    returning * into selected_run;
  if not found then return false; end if;

  update public.applications set status = 'applying', started_at = coalesce(started_at, now()), updated_at = now()
    where id = selected_run.application_id and user_id = p_user_id;
  insert into public.application_events (user_id, application_id, event_type, message, metadata)
    values (p_user_id, selected_run.application_id, 'agent_created', 'Agente de candidatura iniciado', jsonb_build_object('run_id', p_run_id));
  return true;
end;
$$;
revoke all on function public.ack_application_run(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.ack_application_run(uuid, uuid, text) to service_role;