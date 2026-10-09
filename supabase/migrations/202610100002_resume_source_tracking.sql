alter table public.certifications
  add column source_document_id uuid references public.documents(id) on delete set null;
create unique index certifications_resume_import_unique
  on public.certifications (user_id, source_document_id, name, issuer);

alter table public.projects
  add column source_document_id uuid references public.documents(id) on delete set null;
create unique index projects_resume_import_unique
  on public.projects (user_id, source_document_id, name);