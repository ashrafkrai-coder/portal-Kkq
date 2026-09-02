create table if not exists public.kkq_app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  students jsonb not null default '[]'::jsonb,
  tasks jsonb not null default '[]'::jsonb,
  sessions jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.kkq_app_state enable row level security;

revoke all on table public.kkq_app_state from anon;
grant usage on schema public to authenticated;
grant select, insert, update on table public.kkq_app_state to authenticated;

create policy "Teachers can read their own KKQ data"
on public.kkq_app_state for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Teachers can create their own KKQ data"
on public.kkq_app_state for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Teachers can update their own KKQ data"
on public.kkq_app_state for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create or replace function public.set_kkq_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_kkq_app_state_updated_at on public.kkq_app_state;
create trigger set_kkq_app_state_updated_at
before update on public.kkq_app_state
for each row execute function public.set_kkq_updated_at();
