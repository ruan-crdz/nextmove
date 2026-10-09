create extension if not exists pgcrypto;
create extension if not exists pgmq;

create type public.application_status as enum (
  'saved', 'approved', 'queued', 'researching', 'preparing', 'applying', 'needs_input',
  'submitted', 'failed', 'cancelled', 'interview', 'offer', 'closed'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  headline text,
  summary text,
  phone text,
  location text,
  linkedin_url text,
  portfolio_url text,
  completeness smallint not null default 0 check (completeness between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.experiences (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  company text not null, title text not null, location text, description text, start_date date, end_date date,
  is_current boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.educations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  institution text not null, degree text, field_of_study text, start_date date, end_date date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.certifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, issuer text, issued_at date, expires_at date, credential_url text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.skills (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, proficiency text, years_experience numeric(4,1), created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique (user_id, name)
);
create table public.projects (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, description text, url text, technologies text[] not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.evidence_items (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  type text not null, claim text not null, source_type text not null, source_id uuid,
  confidence numeric(3,2) not null default 0 check (confidence between 0 and 1),
  verified_by_user boolean not null default false, allowed_for_application boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.documents (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null, file_name text not null, mime_type text not null, size_bytes bigint not null check (size_bytes > 0),
  processing_status text not null default 'uploaded' check (processing_status in ('uploaded', 'processing', 'review', 'failed')),
  created_at timestamptz not null default now(), unique (user_id, storage_path)
);
create table public.resume_versions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null, title text not null,
  language text not null default 'pt-BR', content jsonb not null default '{}'::jsonb,
  is_current boolean not null default false, created_at timestamptz not null default now()
);
create table public.job_preferences (
  id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id) on delete cascade,
  job_titles text[] not null default '{}', locations text[] not null default '{}', workplace_types text[] not null default '{}',
  employment_types text[] not null default '{}', seniority text[] not null default '{}', salary_min numeric,
  salary_currency text not null default 'BRL', languages text[] not null default '{}', updated_at timestamptz not null default now()
);
create table public.jobs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  title text not null, company text not null, company_logo_url text, location text, workplace_type text, employment_type text,
  seniority text, description_original text not null, description_ai_summary text,
  requirements_required jsonb not null default '[]'::jsonb, requirements_preferred jsonb not null default '[]'::jsonb,
  salary_min numeric, salary_max numeric, currency text, source_platform text not null, source_url text not null,
  application_platform text, application_url text, published_at timestamptz, discovered_at timestamptz not null default now(),
  verified_at timestamptz, created_at timestamptz not null default now(),
  canonical_application_url text generated always as (lower(trim(trailing '/' from coalesce(application_url, source_url)))) stored
);
create unique index jobs_user_canonical_url_idx on public.jobs(user_id, canonical_application_url);
create table public.job_sources (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade, platform text not null, source_url text not null,
  discovered_at timestamptz not null default now(), verified_at timestamptz, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), unique (user_id, job_id, source_url)
);
create table public.job_matches (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade, overall_score smallint not null check (overall_score between 0 and 100),
  recommendation text not null check (recommendation in ('APPLY', 'STRETCH', 'SKIP')),
  dimensions jsonb not null default '{}'::jsonb, matched_requirements jsonb not null default '[]'::jsonb,
  missing_requirements jsonb not null default '[]'::jsonb, transferable_strengths jsonb not null default '[]'::jsonb,
  hard_blockers jsonb not null default '[]'::jsonb, reasoning_summary text, created_at timestamptz not null default now(),
  unique (user_id, job_id)
);
create table public.applications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade, status public.application_status not null default 'saved',
  match_score smallint check (match_score between 0 and 100), resume_version_id uuid references public.resume_versions(id) on delete set null,
  started_at timestamptz, completed_at timestamptz, failure_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (user_id, job_id)
);
create table public.application_runs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade, status text not null default 'queued',
  attempt smallint not null default 0 check (attempt between 0 and 3), checkpoint jsonb not null default '{}'::jsonb,
  started_at timestamptz, completed_at timestamptz, failure_reason text, created_at timestamptz not null default now(),
  unique (user_id, application_id, attempt)
);
create table public.application_steps (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  application_run_id uuid not null references public.application_runs(id) on delete cascade,
  step_key text not null, status text not null default 'pending', detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), completed_at timestamptz
);
create table public.application_answers (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  question_key text not null, question_text text not null, answer text not null, sensitive boolean not null default false,
  verified_by_user boolean not null default false, evidence_item_ids uuid[] not null default '{}', created_at timestamptz not null default now()
);
create table public.application_events (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade, event_type text not null,
  message text not null, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table public.user_rules (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  rule_key text not null, rule_value jsonb not null, enabled boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (user_id, rule_key)
);
create table public.approval_requests (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade, question text not null,
  suggested_answer text, classification text not null check (classification in ('SAFE_AUTO', 'RULE_REQUIRED', 'ALWAYS_APPROVE')),
  evidence_item_ids uuid[] not null default '{}', status text not null default 'pending' check (status in ('pending', 'approved', 'edited', 'rejected')),
  resolved_answer text, resolved_at timestamptz, created_at timestamptz not null default now()
);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'experiences', 'educations', 'certifications', 'skills', 'projects', 'evidence_items', 'documents',
    'resume_versions', 'job_preferences', 'jobs', 'job_sources', 'job_matches', 'applications', 'application_runs',
    'application_steps', 'application_answers', 'application_events', 'user_rules', 'approval_requests'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('create policy %I on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', table_name || '_owner', table_name);
  end loop;
end $$;

alter table public.profiles enable row level security;
create policy profiles_owner on public.profiles for all to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

alter table public.jobs add constraint jobs_user_id_id_unique unique (user_id, id);
alter table public.applications add constraint applications_user_id_id_unique unique (user_id, id);
alter table public.application_runs add constraint application_runs_user_id_id_unique unique (user_id, id);
alter table public.job_sources add constraint job_sources_owned_job_fk foreign key (user_id, job_id) references public.jobs(user_id, id) on delete cascade;
alter table public.job_matches add constraint job_matches_owned_job_fk foreign key (user_id, job_id) references public.jobs(user_id, id) on delete cascade;
alter table public.applications add constraint applications_owned_job_fk foreign key (user_id, job_id) references public.jobs(user_id, id) on delete cascade;
alter table public.application_runs add constraint runs_owned_application_fk foreign key (user_id, application_id) references public.applications(user_id, id) on delete cascade;
alter table public.application_steps add constraint steps_owned_run_fk foreign key (user_id, application_run_id) references public.application_runs(user_id, id) on delete cascade;
alter table public.application_events add constraint events_owned_application_fk foreign key (user_id, application_id) references public.applications(user_id, id) on delete cascade;
alter table public.approval_requests add constraint approvals_owned_application_fk foreign key (user_id, application_id) references public.applications(user_id, id) on delete cascade;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-resumes', 'user-resumes', false, 10485760, array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;
create policy "resume owner read" on storage.objects for select to authenticated
using (bucket_id = 'user-resumes' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "resume owner insert" on storage.objects for insert to authenticated
with check (bucket_id = 'user-resumes' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "resume owner update" on storage.objects for update to authenticated
using (bucket_id = 'user-resumes' and (storage.foldername(name))[1] = (select auth.uid()::text))
with check (bucket_id = 'user-resumes' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "resume owner delete" on storage.objects for delete to authenticated
using (bucket_id = 'user-resumes' and (storage.foldername(name))[1] = (select auth.uid()::text));

select pgmq.create('application_runs');

create or replace function public.enqueue_application(p_application_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected_application public.applications%rowtype;
  selected_run_id uuid;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  select * into selected_application from public.applications
    where id = p_application_id and user_id = current_user_id for update;
  if not found then raise exception 'Application not found'; end if;
  if selected_application.status in ('submitted', 'cancelled', 'failed') then
    raise exception 'Application cannot be queued from its current status';
  end if;
  select id into selected_run_id from public.application_runs
    where application_id = p_application_id and user_id = current_user_id and status = 'queued' limit 1;
  if selected_run_id is not null then return selected_run_id; end if;
  insert into public.application_runs (user_id, application_id, status)
    values (current_user_id, p_application_id, 'queued') returning id into selected_run_id;
  perform pgmq.send('application_runs', jsonb_build_object('run_id', selected_run_id, 'user_id', current_user_id));
  update public.applications set status = 'queued', updated_at = now() where id = p_application_id;
  insert into public.application_events (user_id, application_id, event_type, message)
    values (current_user_id, p_application_id, 'queued', 'Candidatura adicionada à fila');
  return selected_run_id;
end;
$$;
revoke all on function public.enqueue_application(uuid) from public;
grant execute on function public.enqueue_application(uuid) to authenticated;