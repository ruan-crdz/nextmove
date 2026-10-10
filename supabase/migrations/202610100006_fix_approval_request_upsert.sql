drop index if exists public.approval_requests_openai_request_unique;

create unique index if not exists approval_requests_openai_request_unique
  on public.approval_requests (openai_request_id);