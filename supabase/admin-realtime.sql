-- Only a change counter is replicated. Private records stay behind existing admin RPCs.
begin;
create table public.admin_live_signal (
 id boolean primary key default true check(id),
 revision bigint not null default 0
);
insert into public.admin_live_signal values(true,0);
alter table public.admin_live_signal enable row level security;
revoke all on public.admin_live_signal from public,anon,authenticated;
grant select on public.admin_live_signal to authenticated;
create policy admin_live_signal_read on public.admin_live_signal for select to authenticated
 using ((select public.admin_access()));

create function private.notify_admin_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.admin_live_signal set revision=revision+1 where id=true;
 return null;
end $$;
revoke all on function private.notify_admin_change() from public,anon,authenticated;

do $$ declare t text; begin
 foreach t in array array['profiles','moments','captions','caption_votes','generation_requests','generation_runs',
 'pipeline_drafts','pipeline_tests','pipeline_releases','pipeline_active','prompt_chains','prompt_chain_steps',
 'prompt_chain_mix','terms','ai_generation_examples','llm_models','llm_providers','allowed_signup_domains','whitelisted_emails'] loop
  if to_regclass('public.'||t) is not null then
   execute format('create trigger admin_live_changed after insert or update or delete on public.%I for each statement execute function private.notify_admin_change()',t);
  end if;
 end loop;
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.admin_live_signal;
 end if;
end $$;
commit;
