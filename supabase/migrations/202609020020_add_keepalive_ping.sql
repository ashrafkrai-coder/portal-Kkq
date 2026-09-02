create or replace function public.keepalive_ping()
returns timestamptz
language sql
volatile
security invoker
set search_path = ''
as $$
  select clock_timestamp();
$$;

revoke all on function public.keepalive_ping() from public;
revoke all on function public.keepalive_ping() from authenticated;
grant execute on function public.keepalive_ping() to anon;
