alter table public.documents
  add column extracted_profile jsonb,
  add column processing_error text;

alter table public.experiences
  add column source_document_id uuid references public.documents(id) on delete set null;
create unique index experiences_resume_import_unique
  on public.experiences (user_id, source_document_id, company, title);

alter table public.educations
  add column source_document_id uuid references public.documents(id) on delete set null;
create unique index educations_resume_import_unique
  on public.educations (user_id, source_document_id, institution, degree);

alter table public.documents
  drop constraint documents_processing_status_check;

alter table public.documents
  add constraint documents_processing_status_check
  check (processing_status in ('uploaded', 'processing', 'review', 'confirmed', 'failed'));

create table public.languages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  proficiency text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.languages enable row level security;
create policy languages_owner on public.languages
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));