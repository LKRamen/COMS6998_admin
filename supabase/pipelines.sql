-- Draft editing is separate from immutable, tested releases and live activation.
-- Depends on admin.sql and observability.sql. No existing pipeline is activated.
begin;

create function private.valid_pipeline_steps(p_steps jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare s jsonb;
begin
 if jsonb_typeof(p_steps) is distinct from 'array' then return false; end if;
 if jsonb_array_length(p_steps) not between 1 and 3 then return false; end if;
 for s in select value from jsonb_array_elements(p_steps) loop
  if jsonb_typeof(s) is distinct from 'object' then return false; end if;
  if exists(select 1 from jsonb_object_keys(s) k where k not in ('name','model','systemPrompt','userPrompt')) then return false; end if;
  if jsonb_typeof(s->'name') is distinct from 'string' or length(btrim(s->>'name')) not between 1 and 120
   or jsonb_typeof(s->'model') is distinct from 'string'
   or ((s->>'model') <> 'default' and (s->>'model') !~ '^gemini-[a-zA-Z0-9._-]{1,100}$')
   or jsonb_typeof(s->'systemPrompt') is distinct from 'string' or length(btrim(s->>'systemPrompt')) not between 1 and 8000
   or jsonb_typeof(s->'userPrompt') is distinct from 'string' or length(btrim(s->>'userPrompt')) not between 1 and 8000
  then return false; end if;
 end loop;
 return true;
end $$;
revoke all on function private.valid_pipeline_steps(jsonb) from public,anon,authenticated,service_role;

create table public.pipeline_drafts (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(btrim(name)) between 1 and 120),
 description text not null default '' check(length(description)<=1000),
 style text not null check(style in ('Brainrot','Dry sarcasm','Absurdist','College life','NYC','Relatable','Unhinged','Funny','Witty','Postcard')),
 steps jsonb not null check(private.valid_pipeline_steps(steps)),
 version integer not null default 1 check(version>0),
 created_by uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.pipeline_tests (
 id uuid primary key default gen_random_uuid(), pipeline_id uuid not null references public.pipeline_drafts(id),
 draft_version integer not null, snapshot jsonb not null,
 status text not null default 'pending' check(status in ('pending','succeeded','failed')),
 results jsonb, error text check(length(error)<=500),
 created_by uuid not null, session_id uuid not null,
 created_at timestamptz not null default now(), finished_at timestamptz,
 lease_expires_at timestamptz not null default now()+interval '150 seconds'
);
create index pipeline_tests_actor_time_idx on public.pipeline_tests(created_by,created_at desc);
create index pipeline_tests_draft_time_idx on public.pipeline_tests(pipeline_id,created_at desc);
create table public.pipeline_releases (
 id uuid primary key default gen_random_uuid(), pipeline_id uuid not null references public.pipeline_drafts(id),
 draft_version integer not null, name text not null, style text not null,
 steps jsonb not null check(private.valid_pipeline_steps(steps)),
 test_id uuid not null references public.pipeline_tests(id),
 created_by uuid not null, created_at timestamptz not null default now(),
 unique(style,id)
);
create index pipeline_releases_draft_idx on public.pipeline_releases(pipeline_id);
create index pipeline_releases_test_idx on public.pipeline_releases(test_id);
create table public.pipeline_active (
 style text primary key, release_id uuid not null,
 updated_by uuid not null, updated_at timestamptz not null default now(),
 foreign key(style,release_id) references public.pipeline_releases(style,id)
);
create index pipeline_active_release_idx on public.pipeline_active(release_id);

do $$ declare t text; begin
 foreach t in array array['pipeline_drafts','pipeline_tests','pipeline_releases','pipeline_active'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;
grant select on public.pipeline_releases,public.pipeline_active to service_role;

-- Both consumer and admin generation paths already persist settings. Derive the
-- visible provenance label without replacing their existing guarded write RPCs.
create function private.pipeline_run_prompt_version() returns trigger language plpgsql set search_path='' as $$
declare release_id text:=new.settings->'pipeline'->>'id';
begin
 if release_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
  new.prompt_version:='pipeline:'||release_id;
 end if;
 return new;
end $$;
revoke all on function private.pipeline_run_prompt_version() from public,anon,authenticated,service_role;
create trigger pipeline_run_prompt_version before insert on public.generation_runs for each row execute function private.pipeline_run_prompt_version();

create function private.pipeline_release_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Published revisions are immutable. Publish a tested draft as a new revision.' using errcode='55000'; end $$;
revoke all on function private.pipeline_release_immutable() from public,anon,authenticated,service_role;
create trigger pipeline_release_immutable before update or delete on public.pipeline_releases for each row execute function private.pipeline_release_immutable();

create function public.admin_pipeline_read(p_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.require_superadmin();
 select coalesce(jsonb_agg(to_jsonb(d) || jsonb_build_object(
  'active_release',(select to_jsonb(r) from public.pipeline_active a join public.pipeline_releases r on r.id=a.release_id where a.style=d.style),
  'latest_test',(select to_jsonb(t)-'session_id' from public.pipeline_tests t where t.pipeline_id=d.id order by t.created_at desc,t.id desc limit 1)
 ) order by d.updated_at desc,d.id),'[]'::jsonb) into result from public.pipeline_drafts d where p_id is null or d.id=p_id;
 return jsonb_build_object('rows',result,'active',(select coalesce(jsonb_agg(to_jsonb(r) || jsonb_build_object('release_id',a.release_id) order by a.style),'[]'::jsonb) from public.pipeline_active a join public.pipeline_releases r on r.id=a.release_id));
end $$;

create function public.admin_pipeline_save(p_id uuid default null,p_version integer default null,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_superadmin(); d public.pipeline_drafts;
begin
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Invalid pipeline.' using errcode='22023'; end if;
 if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('name','description','style','steps'))
  or jsonb_typeof(p_data->'name') is distinct from 'string'
  or jsonb_typeof(p_data->'description') is distinct from 'string'
  or jsonb_typeof(p_data->'style') is distinct from 'string'
  or not private.valid_pipeline_steps(p_data->'steps')
 then raise exception 'Check the pipeline name, style and all prompt steps.' using errcode='22023'; end if;
 if p_id is null then
  insert into public.pipeline_drafts(name,description,style,steps,created_by)
   values(btrim(p_data->>'name'),p_data->>'description',p_data->>'style',p_data->'steps',actor) returning * into d;
 else
  select * into d from public.pipeline_drafts where id=p_id for update;
  if not found then raise exception 'Pipeline not found.' using errcode='P0002'; end if;
  if p_version is distinct from d.version then raise exception 'Pipeline changed in another tab. Reload before saving.' using errcode='40001'; end if;
  update public.pipeline_drafts set name=btrim(p_data->>'name'),description=p_data->>'description',style=p_data->>'style',steps=p_data->'steps',version=version+1,updated_at=now()
   where id=p_id returning * into d;
 end if;
 insert into private.catalog_audit(actor_id,collection,action,record_id) values(actor,'pipeline_drafts',case when p_id is null then 'create' else 'update' end,d.id);
 return to_jsonb(d);
end $$;

create function public.admin_pipeline_start_test(p_id uuid,p_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_superadmin(); d public.pipeline_drafts; t public.pipeline_tests;
begin
 -- Serialize rate limits so concurrent HTTP requests cannot both reserve a test.
 perform pg_advisory_xact_lock(hashtextextended('pipeline-test:'||actor::text,0));
 update public.pipeline_tests set status='failed',error='Test expired. Run a new test.',finished_at=now() where created_by=actor and status='pending' and lease_expires_at<=now();
 if exists(select 1 from public.pipeline_tests where created_by=actor and status='pending') then raise exception 'A pipeline test is already running. Wait before testing again.' using errcode='55000'; end if;
 if (select count(*) from public.pipeline_tests where created_by=actor and created_at>now()-interval '1 hour')>=10 then raise exception 'You have reached 10 pipeline tests this hour. Try again later.' using errcode='54000'; end if;
 select * into d from public.pipeline_drafts where id=p_id for update;
 if not found then raise exception 'Pipeline not found.' using errcode='P0002'; end if;
 if p_version is distinct from d.version then raise exception 'Pipeline changed. Save and test the latest draft.' using errcode='40001'; end if;
 insert into public.pipeline_tests(pipeline_id,draft_version,snapshot,created_by,session_id)
 values(d.id,d.version,jsonb_build_object('name',d.name,'description',d.description,'style',d.style,'steps',d.steps,'version',d.version),actor,(auth.jwt()->>'session_id')::uuid) returning * into t;
 return to_jsonb(t)-'session_id';
end $$;

-- Only the trusted server may certify the output of an actual provider request.
create function public.admin_pipeline_finish_test(p_test_id uuid,p_status text,p_results jsonb,p_error text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.pipeline_tests; s jsonb; i integer; c jsonb;
begin
 select * into t from public.pipeline_tests where id=p_test_id for update;
 if not found then raise exception 'Test not found.' using errcode='P0002'; end if;
 if t.status<>'pending' or t.lease_expires_at<=now() then raise exception 'Test is no longer pending. Run a new test.' using errcode='40001'; end if;
 if p_status not in ('succeeded','failed') or p_status is null then raise exception 'Invalid test status.' using errcode='22023'; end if;
 if not exists(select 1 from public.profiles where id=t.created_by and is_superadmin)
  or not exists(select 1 from auth.sessions where id=t.session_id and user_id=t.created_by)
 then raise exception 'The test owner no longer has an active superadmin session.' using errcode='42501'; end if;
 if p_status='succeeded' then
  if jsonb_typeof(p_results) is distinct from 'object' or length(p_results::text)>400000
   or jsonb_typeof(p_results->'steps') is distinct from 'array'
   or jsonb_typeof(p_results->'captions') is distinct from 'array'
  then raise exception 'Invalid test results.' using errcode='22023'; end if;
  if jsonb_array_length(p_results->'steps')<>jsonb_array_length(t.snapshot->'steps') or jsonb_array_length(p_results->'captions')<>3 then raise exception 'Incomplete test results.' using errcode='22023'; end if;
  for i in 0..jsonb_array_length(t.snapshot->'steps')-1 loop
   s:=p_results->'steps'->i;
   if jsonb_typeof(s) is distinct from 'object'
    or jsonb_typeof(s->'model') is distinct from 'string' or (s->>'model') !~ '^gemini-[a-zA-Z0-9._-]{1,100}$'
    or (t.snapshot->'steps'->i->>'model'<>'default' and s->>'model' is distinct from t.snapshot->'steps'->i->>'model')
    or jsonb_typeof(s->'output') is distinct from 'string' or length(btrim(s->>'output')) not between 1 and 16000
    or (s ? 'systemPrompt' and (jsonb_typeof(s->'systemPrompt') is distinct from 'string' or length(s->>'systemPrompt')>18000))
    or (s ? 'userPrompt' and (jsonb_typeof(s->'userPrompt') is distinct from 'string' or length(s->>'userPrompt')>32000))
   then raise exception 'Invalid step result or model.' using errcode='22023'; end if;
  end loop;
  for c in select value from jsonb_array_elements(p_results->'captions') loop
   if jsonb_typeof(c) is distinct from 'string' or length(btrim(c#>>'{}')) not between 1 and 240 then raise exception 'Invalid test caption.' using errcode='22023'; end if;
  end loop;
  if (select count(distinct lower(btrim(value))) from jsonb_array_elements_text(p_results->'captions'))<>3 then raise exception 'Test captions must be distinct.' using errcode='22023'; end if;
 end if;
 update public.pipeline_tests set status=p_status,results=case when p_status='succeeded' then p_results else null end,error=case when p_status='failed' then left(coalesce(p_error,'Test failed. Try again.'),500) else null end,finished_at=now() where id=t.id returning * into t;
 return to_jsonb(t)-'session_id';
end $$;

create function public.admin_pipeline_publish(p_id uuid,p_version integer,p_test_id uuid,p_expected_release uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_superadmin(); d public.pipeline_drafts; t public.pipeline_tests; r public.pipeline_releases; current_release uuid; frozen_steps jsonb;
begin
 select * into d from public.pipeline_drafts where id=p_id for update;
 if not found then raise exception 'Pipeline not found.' using errcode='P0002'; end if;
 if p_version is distinct from d.version then raise exception 'Pipeline changed. Test the latest saved draft before publishing.' using errcode='40001'; end if;
 select * into t from public.pipeline_tests where id=p_test_id and pipeline_id=d.id;
 if not found or t.status<>'succeeded' or t.draft_version<>d.version
  or t.snapshot->'steps' is distinct from d.steps or t.snapshot->>'style' is distinct from d.style
 then raise exception 'A successful test of this exact draft revision is required before publishing.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('pipeline-style:'||d.style,0));
 select release_id into current_release from public.pipeline_active where style=d.style;
 if current_release is distinct from p_expected_release then raise exception 'The live pipeline changed. Reload and review it before publishing.' using errcode='40001'; end if;
 select jsonb_agg(s.value || jsonb_build_object('model',t.results->'steps'->((s.ordinality-1)::integer)->>'model') order by s.ordinality) into frozen_steps
  from jsonb_array_elements(d.steps) with ordinality s;
 insert into public.pipeline_releases(pipeline_id,draft_version,name,style,steps,test_id,created_by) values(d.id,d.version,d.name,d.style,frozen_steps,t.id,actor) returning * into r;
 insert into public.pipeline_active(style,release_id,updated_by) values(d.style,r.id,actor)
  on conflict(style) do update set release_id=excluded.release_id,updated_by=actor,updated_at=now();
 insert into private.catalog_audit(actor_id,collection,action,record_id) values(actor,'pipeline_releases','publish',r.id);
 return to_jsonb(r);
end $$;

create function public.admin_pipeline_unpublish(p_style text,p_expected_release uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_superadmin(); current_release uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('pipeline-style:'||coalesce(p_style,''),0));
 select release_id into current_release from public.pipeline_active where style=p_style;
 if current_release is null or current_release is distinct from p_expected_release then raise exception 'The live pipeline changed. Reload before restoring built-in prompts.' using errcode='40001'; end if;
 delete from public.pipeline_active where style=p_style;
 insert into private.catalog_audit(actor_id,collection,action,record_id) values(actor,'pipeline_releases','unpublish',current_release);
 return jsonb_build_object('style',p_style,'release_id',null,'restored_builtin',true);
end $$;

revoke all on function public.admin_pipeline_read(uuid),public.admin_pipeline_save(uuid,integer,jsonb),public.admin_pipeline_start_test(uuid,integer),public.admin_pipeline_finish_test(uuid,text,jsonb,text),public.admin_pipeline_publish(uuid,integer,uuid,uuid),public.admin_pipeline_unpublish(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_pipeline_read(uuid),public.admin_pipeline_save(uuid,integer,jsonb),public.admin_pipeline_start_test(uuid,integer),public.admin_pipeline_publish(uuid,integer,uuid,uuid),public.admin_pipeline_unpublish(text,uuid) to authenticated;
grant execute on function public.admin_pipeline_finish_test(uuid,text,jsonb,text) to service_role;

-- Execution traces are appended after reservation; they are not generation inputs.
-- Preserve the existing reservation and lease semantics, excluding only this trace
-- from idempotency comparison so replaying a completed request remains safe.
create or replace function public.caption_reserve(p_user_id uuid,p_moment_id uuid,p_request_key uuid,p_system_prompt text,p_user_prompt text,p_model text,p_settings jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.moments; r public.generation_requests; d date:=(now() at time zone 'America/New_York')::date;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 if not exists(select 1 from public.profiles where id=p_user_id and username_claimed and nullif(btrim(username),'') is not null and nullif(btrim(display_name),'') is not null) then raise exception 'Complete your profile.'; end if;
 select * into r from public.generation_requests where creator_id=p_user_id and request_key=p_request_key;
 if found then
  if r.moment_id is distinct from p_moment_id or r.system_prompt<>p_system_prompt or (r.user_prompt::jsonb-'previousCaptions')<>(p_user_prompt::jsonb-'previousCaptions') or r.model<>p_model or (r.settings-'pipelineTrace')<>(p_settings-'pipelineTrace') then raise exception 'Request key belongs to different inputs.'; end if;
  return jsonb_build_object('id',r.id,'state',r.state,'reused',true,'run_id',r.run_id);
 end if;
 update public.generation_requests set state='expired' where creator_id=p_user_id and state='pending' and lease_expires_at<=now();
 if exists(select 1 from public.generation_requests where creator_id=p_user_id and state='pending') then raise exception 'A generation is already running. Please wait.'; end if;
 select * into m from public.moments where id=p_moment_id and creator_id=p_user_id and status='draft' for update;
 if not found then raise exception 'Draft is unavailable.'; end if;
 if (p_user_prompt::jsonb->>'context') is distinct from m.context or (p_user_prompt::jsonb->>'style') is distinct from m.style or (p_user_prompt::jsonb->>'photoRevision') is distinct from m.photo_revision::text then raise exception 'Draft changed. Save and try again.'; end if;
 insert into public.generation_requests(creator_id,moment_id,request_key,quota_date,state,lease_expires_at,photo_revision,photo_path,context,style,system_prompt,user_prompt,model,settings)
 values(p_user_id,m.id,p_request_key,d,'pending',now()+interval '2 minutes',m.photo_revision,m.photo_path,m.context,m.style,p_system_prompt,p_user_prompt,p_model,p_settings) returning * into r;
 return jsonb_build_object('id',r.id,'state',r.state,'reused',false,'photo_revision',r.photo_revision);
end $$;
revoke all on function public.caption_reserve(uuid,uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.caption_reserve(uuid,uuid,uuid,text,text,text,jsonb) to service_role;
commit;
