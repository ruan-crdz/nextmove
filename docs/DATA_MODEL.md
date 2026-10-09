# Modelo de dados

A migration `supabase/migrations/202610090001_initial_schema.sql` cria 20 tabelas: `profiles`, `experiences`, `educations`, `certifications`, `skills`, `projects`, `evidence_items`, `documents`, `resume_versions`, `job_preferences`, `jobs`, `job_sources`, `job_matches`, `applications`, `application_runs`, `application_steps`, `application_answers`, `application_events`, `user_rules` e `approval_requests`.

As entidades de usuário carregam `user_id` (ou `profiles.id`) ligado a `auth.users`. RLS limita acesso ao proprietário. Relações de vaga, aplicação e execução usam constraints compostas para exigir que a linha referenciada pertença ao mesmo usuário.

Cada vaga preserva `description_original`, `source_platform`, `source_url` e URL/plataforma de aplicação separadamente do resumo de IA. URLs canônicas são deduplicadas por usuário. O upload usa o bucket privado `user-resumes`, com primeiro segmento do caminho igual ao UUID autenticado.

O schema foi inspecionado estruturalmente, mas não executado pelo Supabase CLI/Docker neste ambiente. Execute `supabase db reset` em ambiente local isolado ou `supabase db push` no projeto de destino depois de revisar a migration.