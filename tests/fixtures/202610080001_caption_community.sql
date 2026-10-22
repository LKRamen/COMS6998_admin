-- Additive assignment-4 migration. Apply only through supabase-coms6998.
begin;
create schema if not exists private;

create table public.moments (
 id uuid primary key default gen_random_uuid(), creator_id uuid not null references public.profiles(id) on delete cascade,
 photo_path text not null unique, photo_revision uuid not null default gen_random_uuid(),
 context text not null default '' check(char_length(context)<=500), location text not null default '' check(char_length(location)<=120),
 style text not null default 'Funny' check(style in ('Funny','Witty','Postcard')),
 status text not null default 'draft' check(status in ('draft','published')), selected_caption_id uuid,
 public_location text, public_style text, author_name text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), published_at timestamptz,
 check(split_part(photo_path,'/',1)=creator_id::text),
 check((status='draft' and published_at is null) or (status='published' and published_at is not null and selected_caption_id is not null and author_name is not null))
);
create table public.generation_runs (
 id uuid primary key default gen_random_uuid(), moment_id uuid not null references public.moments(id) on delete cascade,
 creator_id uuid not null references public.profiles(id) on delete cascade, photo_revision uuid not null, photo_path text not null, request_key uuid not null,
 context text not null, location text not null, style text not null,
 system_prompt text not null, user_prompt text not null, provider text not null default 'gemini', model text not null,
 prompt_version text not null default 'travel-v1', settings jsonb not null, created_at timestamptz not null default now(),
 unique(creator_id,request_key), check(split_part(photo_path,'/',1)=creator_id::text)
);
create table public.captions (
 id uuid primary key default gen_random_uuid(), generation_run_id uuid not null references public.generation_runs(id) on delete cascade,
 moment_id uuid not null references public.moments(id) on delete cascade, creator_id uuid not null references public.profiles(id) on delete cascade,
 ordinal smallint not null check(ordinal between 1 and 3), text text not null check(char_length(btrim(text)) between 1 and 240),
 unique(generation_run_id,ordinal), unique(moment_id,id)
);
alter table public.moments add constraint moments_selected_same_post foreign key(id,selected_caption_id) references public.captions(moment_id,id) deferrable initially deferred;
create table public.caption_votes (
 user_id uuid not null references public.profiles(id) on delete cascade, caption_id uuid not null references public.captions(id) on delete cascade,
 value smallint not null check(value in (-1,1)), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(user_id,caption_id)
);
create table public.generation_requests (
 id uuid primary key default gen_random_uuid(), creator_id uuid not null references public.profiles(id) on delete cascade,
 moment_id uuid references public.moments(id) on delete set null, request_key uuid not null,
 quota_date date not null, state text not null check(state in ('pending','succeeded','failed','expired')),
 lease_expires_at timestamptz not null, photo_revision uuid not null, photo_path text not null, context text not null, location text not null, style text not null,
 system_prompt text not null, user_prompt text not null, model text not null, settings jsonb not null,
 run_id uuid references public.generation_runs(id) on delete set null, created_at timestamptz not null default now(),
 unique(creator_id,request_key)
);
create table public.photo_cleanup_requests (
 creator_id uuid not null references public.profiles(id) on delete cascade, photo_path text primary key,
 created_at timestamptz not null default now(), check(split_part(photo_path,'/',1)=creator_id::text)
);
create index moments_published_idx on public.moments(published_at desc,id) where status='published';
create index moments_owner_idx on public.moments(creator_id,created_at desc);
create index caption_votes_caption_idx on public.caption_votes(caption_id);
create index generation_requests_quota_idx on public.generation_requests(creator_id,quota_date,state);
create index generation_runs_moment_idx on public.generation_runs(moment_id);
create index captions_moment_idx on public.captions(moment_id);

alter table public.moments enable row level security;
alter table public.generation_runs enable row level security;
alter table public.captions enable row level security;
alter table public.caption_votes enable row level security;
alter table public.generation_requests enable row level security;
alter table public.photo_cleanup_requests enable row level security;
revoke all on public.moments,public.generation_runs,public.captions,public.caption_votes,public.generation_requests,public.photo_cleanup_requests from anon,authenticated;
grant select on public.moments,public.generation_runs,public.captions,public.caption_votes,public.photo_cleanup_requests to authenticated;
grant all on public.moments,public.generation_runs,public.captions,public.caption_votes,public.generation_requests,public.photo_cleanup_requests to service_role;
create policy moment_owner_read on public.moments for select to authenticated using(creator_id=(select auth.uid()));
create policy run_owner_read on public.generation_runs for select to authenticated using(creator_id=(select auth.uid()));
create policy caption_owner_read on public.captions for select to authenticated using(creator_id=(select auth.uid()));
create policy vote_owner_read on public.caption_votes for select to authenticated using(user_id=(select auth.uid()));
create policy cleanup_owner_read on public.photo_cleanup_requests for select to authenticated using(creator_id=(select auth.uid()));

create function private.caption_require_user() returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if u is null or not exists(select 1 from public.profiles where id=u and nullif(btrim(first_name),'') is not null and nullif(btrim(last_name),'') is not null) then
  raise exception 'Sign in and complete your profile.' using errcode='42501';
 end if;
 return u;
end $$;
revoke all on function private.caption_require_user() from public,anon,authenticated;

create function public.caption_feed(p_sort text default 'new',p_offset integer default 0) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(row_data order by rank_score desc,published_at desc,id desc),'[]'::jsonb) from (
  select m.id,m.published_at,case when p_sort='top' then coalesce(sum(v.value),0) else 0 end rank_score,
   jsonb_build_object('id',m.id,'caption_id',c.id,'text',c.text,'photo_path',m.photo_path,'location',m.public_location,
   'style',m.public_style,'author_name',m.author_name,'published_at',m.published_at,'score',coalesce(sum(v.value),0)) row_data
  from public.moments m join public.captions c on c.id=m.selected_caption_id and c.moment_id=m.id
  left join public.caption_votes v on v.caption_id=c.id
  where m.status='published' and (p_sort<>'top' or m.published_at>=now()-interval '168 hours')
  group by m.id,c.id order by rank_score desc,m.published_at desc,m.id desc limit 20 offset greatest(0,least(p_offset,10000))
 ) feed;
$$;

create function public.caption_allowance() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.caption_require_user(); d date:=(now() at time zone 'America/New_York')::date; used integer;
begin
 select count(*) into used from public.generation_requests where creator_id=u and quota_date=d and (state='succeeded' or (state='pending' and lease_expires_at>now()));
 return jsonb_build_object('remaining',greatest(0,5-used),'reset_at',((d+1)::timestamp at time zone 'America/New_York'));
end $$;

create function public.caption_save_draft(p_moment_id uuid,p_context text,p_location text,p_style text,p_selected_caption_id uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.caption_require_user(); m public.moments;
begin
 select * into m from public.moments where id=p_moment_id and creator_id=u for update;
 if not found or m.status<>'draft' then raise exception 'Draft is unavailable.' using errcode='42501'; end if;
 if char_length(p_context)>500 or char_length(p_location)>120 or p_style not in ('Funny','Witty','Postcard') or p_context is null or p_location is null or p_style is null then raise exception 'Invalid draft inputs.'; end if;
 if p_selected_caption_id is not null and not exists(select 1 from public.captions c join public.generation_runs r on r.id=c.generation_run_id where c.id=p_selected_caption_id and c.moment_id=m.id and r.photo_revision=m.photo_revision) then raise exception 'Caption does not belong to this photo.'; end if;
 update public.moments set context=btrim(p_context),location=btrim(p_location),style=p_style,selected_caption_id=p_selected_caption_id,updated_at=now() where id=m.id;
end $$;

create function public.caption_publish(p_moment_id uuid,p_caption_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.caption_require_user(); m public.moments; r public.generation_runs;
begin
 select * into m from public.moments where id=p_moment_id and creator_id=u for update;
 if not found then raise exception 'Post is unavailable.' using errcode='42501'; end if;
 if m.status='published' then
  if m.selected_caption_id=p_caption_id then return; end if;
  raise exception 'Published captions cannot change.';
 end if;
 select g.* into r from public.generation_runs g join public.captions c on c.generation_run_id=g.id where c.id=p_caption_id and c.moment_id=m.id and g.photo_revision=m.photo_revision;
 if not found then raise exception 'Choose a caption generated for this photo.'; end if;
 update public.moments set status='published',selected_caption_id=p_caption_id,public_location=r.location,public_style=r.style,
 author_name=(select btrim(first_name) from public.profiles where id=u),published_at=now(),updated_at=now() where id=m.id;
end $$;

create function public.caption_vote(p_caption_id uuid,p_value smallint) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.caption_require_user(); owner_id uuid; total bigint;
begin
 if p_value is not null and p_value not in (-1,1) then raise exception 'Invalid vote.'; end if;
 -- Lock publication row against deletion; serialize each caption's score updates.
 select creator_id into owner_id from public.moments where selected_caption_id=p_caption_id and status='published' for update;
 if not found then raise exception 'This post is unavailable.' using errcode='42501'; end if;
 if owner_id=u then raise exception 'You cannot vote on your own post.' using errcode='42501'; end if;
 if p_value is null then delete from public.caption_votes where user_id=u and caption_id=p_caption_id;
 else insert into public.caption_votes(user_id,caption_id,value) values(u,p_caption_id,p_value)
  on conflict(user_id,caption_id) do update set value=excluded.value,updated_at=now(); end if;
 select coalesce(sum(value),0) into total from public.caption_votes where caption_id=p_caption_id;
 return jsonb_build_object('vote',p_value,'score',total);
end $$;

create function public.caption_delete(p_moment_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.caption_require_user(); m public.moments;
begin
 select * into m from public.moments where id=p_moment_id and creator_id=u for update;
 if not found then return; end if;
 insert into public.photo_cleanup_requests(creator_id,photo_path) values(u,m.photo_path) on conflict do nothing;
 update public.generation_requests set state='failed' where moment_id=m.id and state='pending';
 delete from public.moments where id=m.id;
end $$;

create function public.caption_cleanup_done(p_photo_path text) returns void language plpgsql security definer set search_path='' as $$
begin delete from public.photo_cleanup_requests where creator_id=private.caption_require_user() and photo_path=p_photo_path; end $$;

create function public.caption_replace_photo(p_user_id uuid,p_moment_id uuid,p_photo_path text,p_context text,p_location text,p_style text)
returns uuid language plpgsql security definer set search_path='' as $$
declare m public.moments;
begin
 select * into m from public.moments where id=p_moment_id and creator_id=p_user_id and status='draft' for update;
 if not found then raise exception 'Draft is unavailable.'; end if;
 if p_photo_path is null or split_part(p_photo_path,'/',1)<>p_user_id::text or p_photo_path=m.photo_path then raise exception 'Invalid photo path.'; end if;
 if p_context is null or p_location is null or p_style is null or char_length(p_context)>500 or char_length(p_location)>120 or p_style not in ('Funny','Witty','Postcard') then raise exception 'Invalid draft inputs.'; end if;
 insert into public.photo_cleanup_requests(creator_id,photo_path) values(p_user_id,m.photo_path) on conflict do nothing;
 update public.moments set photo_path=p_photo_path,photo_revision=gen_random_uuid(),selected_caption_id=null,
 context=btrim(p_context),location=btrim(p_location),style=p_style,updated_at=now() where id=m.id;
 return m.id;
end $$;

-- Service-only generation writes. Identity is derived by the authenticated server, never by browser form input.
create function public.caption_reserve(p_user_id uuid,p_moment_id uuid,p_request_key uuid,p_system_prompt text,p_user_prompt text,p_model text,p_settings jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.moments; r public.generation_requests; d date:=(now() at time zone 'America/New_York')::date; used integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 if not exists(select 1 from public.profiles where id=p_user_id and nullif(btrim(first_name),'') is not null and nullif(btrim(last_name),'') is not null) then raise exception 'Complete your profile.'; end if;
 select * into r from public.generation_requests where creator_id=p_user_id and request_key=p_request_key;
 if found then
  if r.moment_id is distinct from p_moment_id or r.system_prompt<>p_system_prompt or (r.user_prompt::jsonb-'previousCaptions')<>(p_user_prompt::jsonb-'previousCaptions') or r.model<>p_model or r.settings<>p_settings then raise exception 'Request key belongs to different inputs.'; end if;
  return jsonb_build_object('id',r.id,'state',r.state,'reused',true,'run_id',r.run_id);
 end if;
 update public.generation_requests set state='expired' where creator_id=p_user_id and state='pending' and lease_expires_at<=now();
 if exists(select 1 from public.generation_requests where creator_id=p_user_id and state='pending') then raise exception 'A generation is already running. Please wait.'; end if;
 select count(*) into used from public.generation_requests where creator_id=p_user_id and quota_date=d and state in ('pending','succeeded');
 if used>=5 then raise exception 'Daily limit reached. You can generate five batches per day.'; end if;
 select * into m from public.moments where id=p_moment_id and creator_id=p_user_id and status='draft' for update;
 if not found then raise exception 'Draft is unavailable.'; end if;
 -- Prompts must describe the exact saved input snapshot, even if another tab saved it.
 if (p_user_prompt::jsonb->>'context') is distinct from m.context or (p_user_prompt::jsonb->>'location') is distinct from m.location or (p_user_prompt::jsonb->>'style') is distinct from m.style or (p_user_prompt::jsonb->>'photoRevision') is distinct from m.photo_revision::text then raise exception 'Draft changed. Save and try again.'; end if;
 insert into public.generation_requests(creator_id,moment_id,request_key,quota_date,state,lease_expires_at,photo_revision,photo_path,context,location,style,system_prompt,user_prompt,model,settings)
 values(p_user_id,m.id,p_request_key,d,'pending',now()+interval '2 minutes',m.photo_revision,m.photo_path,m.context,m.location,m.style,p_system_prompt,p_user_prompt,p_model,p_settings) returning * into r;
 return jsonb_build_object('id',r.id,'state',r.state,'reused',false,'photo_revision',r.photo_revision);
end $$;

create function public.caption_finish(p_user_id uuid,p_request_id uuid,p_captions jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.generation_requests; run uuid; m public.moments;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 select * into r from public.generation_requests where id=p_request_id and creator_id=p_user_id for update;
 if not found then raise exception 'Generation is unavailable.'; end if;
 if r.state='succeeded' then return r.run_id; end if;
 if r.state<>'pending' or r.lease_expires_at<=now() then raise exception 'Generation expired. Please try again.'; end if;
 select * into m from public.moments where id=r.moment_id and status='draft' and creator_id=p_user_id and photo_revision=r.photo_revision for update;
 if not found then raise exception 'Draft changed or was removed.'; end if;
 if jsonb_typeof(p_captions)<>'array' or jsonb_array_length(p_captions)<>3 then raise exception 'Expected three captions.'; end if;
 if exists(select 1 from jsonb_array_elements(p_captions) x where jsonb_typeof(x)<>'string' or char_length(btrim(x#>>'{}')) not between 1 and 240)
 or (select count(distinct lower(btrim(x#>>'{}'))) from jsonb_array_elements(p_captions) x)<>3 then raise exception 'Invalid or duplicate captions.'; end if;
 insert into public.generation_runs(moment_id,creator_id,photo_revision,photo_path,request_key,context,location,style,system_prompt,user_prompt,model,settings)
 values(m.id,p_user_id,r.photo_revision,r.photo_path,r.request_key,r.context,r.location,r.style,r.system_prompt,r.user_prompt,r.model,r.settings) returning id into run;
 insert into public.captions(generation_run_id,moment_id,creator_id,ordinal,text)
 select run,m.id,p_user_id,n::smallint,btrim(x#>>'{}') from jsonb_array_elements(p_captions) with ordinality as e(x,n);
 update public.generation_requests set state='succeeded',run_id=run where id=r.id;
 return run;
end $$;
create function public.caption_fail(p_user_id uuid,p_request_id uuid) returns void language sql security definer set search_path='' as $$
 update public.generation_requests set state='failed' where id=p_request_id and creator_id=p_user_id and state='pending';
$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('caption-photos','caption-photos',false,5242880,array['image/jpeg']);
-- Writes only through normalized server upload; public readers get only published image objects.
create function public.caption_photo_visible(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.moments where photo_path=p_path and (status='published' or creator_id=auth.uid()));
$$;
create policy caption_photo_read on storage.objects for select to anon,authenticated using(bucket_id='caption-photos' and public.caption_photo_visible(name));

revoke all on function public.caption_feed(text,integer),public.caption_photo_visible(text) from public;
grant execute on function public.caption_feed(text,integer),public.caption_photo_visible(text) to anon,authenticated;
revoke all on function public.caption_allowance(),public.caption_save_draft(uuid,text,text,text,uuid),public.caption_publish(uuid,uuid),public.caption_vote(uuid,smallint),public.caption_delete(uuid),public.caption_cleanup_done(text) from public,anon;
grant execute on function public.caption_allowance(),public.caption_save_draft(uuid,text,text,text,uuid),public.caption_publish(uuid,uuid),public.caption_vote(uuid,smallint),public.caption_delete(uuid),public.caption_cleanup_done(text) to authenticated;
revoke all on function public.caption_reserve(uuid,uuid,uuid,text,text,text,jsonb),public.caption_finish(uuid,uuid,jsonb),public.caption_fail(uuid,uuid),public.caption_replace_photo(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.caption_reserve(uuid,uuid,uuid,text,text,text,jsonb),public.caption_finish(uuid,uuid,jsonb),public.caption_fail(uuid,uuid),public.caption_replace_photo(uuid,uuid,text,text,text,text) to service_role;
commit;
