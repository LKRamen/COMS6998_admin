-- Explicitly authorized retirement of all legacy photo geodata and map tables.
-- Preserve image objects, captions, votes, ownership and non-location generation provenance.
begin;
alter table public.profiles alter column username drop not null;
alter table public.profiles add column username_claimed boolean not null default false;
update public.profiles set username_claimed=true where username is not null and username !~ '^user_[0-9a-f]{32}$';
drop trigger brainrot_profile_defaults on public.profiles;
drop function private.brainrot_profile_defaults();
do $$ declare p record; candidate text; stem text; suffix integer; begin
 for p in select id,display_name from public.profiles where username ~ '^user_[0-9a-f]{32}$' order by created_at,id loop
  stem:=left(trim(both '_' from regexp_replace(lower(coalesce(nullif(p.display_name,''),'creator')),'[^a-z0-9]+','_','g')),32);
  if char_length(stem)<3 then stem:='creator'; end if;
  candidate:=stem; suffix:=1;
  while exists(select 1 from public.profiles where lower(username)=candidate and id<>p.id) loop suffix:=suffix+1; candidate:=stem||'_'||suffix; end loop;
  update public.profiles set username=candidate where id=p.id;
 end loop;
end $$;


create or replace function public.brainrot_save_profile(p_username text,p_display_name text,p_bio text,p_avatar_path text default null)
returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if u is null then raise exception 'Sign in to edit your profile.' using errcode='42501'; end if;
 if p_username is null or lower(btrim(p_username)) !~ '^[a-z0-9_]{3,40}$' or p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 80 or p_bio is null or char_length(p_bio)>240 then raise exception 'Check your username, display name and bio.'; end if;
 if p_avatar_path is not null and (split_part(p_avatar_path,'/',1)<>u::text or not exists(select 1 from storage.objects where bucket_id='avatars' and name=p_avatar_path)) then raise exception 'Choose your own uploaded avatar.' using errcode='42501'; end if;
 insert into public.profiles(id,username,display_name,bio,first_name,last_name,public_avatar_path,avatar_path,username_claimed)
 values(u,lower(btrim(p_username)),btrim(p_display_name),btrim(p_bio),btrim(p_display_name),'Creator',p_avatar_path,p_avatar_path,true)
 on conflict(id) do update set username=excluded.username,display_name=excluded.display_name,bio=excluded.bio,
 first_name=coalesce(nullif(public.profiles.first_name,''),excluded.first_name),last_name=coalesce(nullif(public.profiles.last_name,''),'Creator'),
 username_claimed=true,public_avatar_path=excluded.public_avatar_path,avatar_path=coalesce(excluded.avatar_path,public.profiles.avatar_path),updated_at=now();
end $$;
create or replace function private.caption_require_user() returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if u is null or not exists(select 1 from public.profiles where id=u and username_claimed and nullif(btrim(username),'') is not null and nullif(btrim(display_name),'') is not null) then
  raise exception 'Sign in and complete your profile.' using errcode='42501';
 end if;
 return u;
end $$;
drop function public.caption_feed_country(text,integer,text);
drop function public.caption_feed(text,integer);
drop function public.community_country_visits();
drop function public.caption_set_location(uuid,text,text);
drop function public.caption_publish(uuid,uuid);
drop function public.caption_replace_photo_location(uuid,uuid,text,text,text,text,text);
drop function public.caption_replace_photo(uuid,uuid,text,text,text,text);
drop function public.brainrot_save_draft(uuid,text,text,text,uuid,uuid);
drop function public.caption_save_draft(uuid,text,text,text,uuid);

create or replace function public.brainrot_save_draft(p_moment_id uuid,p_context text,p_style text,p_selected_caption_id uuid,p_photo_revision uuid)
returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.caption_require_user(); m public.moments;
begin
 select * into m from public.moments where id=p_moment_id and creator_id=u for update;
 if not found or m.status<>'draft' then raise exception 'Draft is unavailable.' using errcode='42501'; end if;
 if p_photo_revision is distinct from m.photo_revision then raise exception 'This photo changed in another tab. Reload before saving.' using errcode='22023'; end if;
 if char_length(p_context)>500 or p_style not in ('Funny','Witty','Postcard','Brainrot','Dry sarcasm','Absurdist','College life','NYC','Relatable','Unhinged') or p_context is null or p_style is null then raise exception 'Invalid draft inputs.'; end if;
 if p_selected_caption_id is not null and not exists(select 1 from public.captions c join public.generation_runs r on r.id=c.generation_run_id where c.id=p_selected_caption_id and c.moment_id=m.id and r.photo_revision=m.photo_revision) then raise exception 'Caption does not belong to this photo.'; end if;
 update public.moments set context=btrim(p_context),style=p_style,selected_caption_id=p_selected_caption_id,
 caption_override=case when selected_caption_id is not distinct from p_selected_caption_id then caption_override else null end,updated_at=now() where id=m.id;
end $$;
create or replace function public.caption_replace_photo(p_user_id uuid,p_moment_id uuid,p_photo_path text,p_context text,p_style text)
returns uuid language plpgsql security definer set search_path='' as $$
declare m public.moments;
begin
 select * into m from public.moments where id=p_moment_id and creator_id=p_user_id and status='draft' for update;
 if not found then raise exception 'Draft is unavailable.'; end if;
 if p_photo_path is null or split_part(p_photo_path,'/',1)<>p_user_id::text or p_photo_path=m.photo_path then raise exception 'Invalid photo path.'; end if;
 if p_context is null or p_style is null or char_length(p_context)>500 or p_style not in ('Funny','Witty','Postcard','Brainrot','Dry sarcasm','Absurdist','College life','NYC','Relatable','Unhinged') then raise exception 'Invalid draft inputs.'; end if;
 insert into public.photo_cleanup_requests(creator_id,photo_path) values(p_user_id,m.photo_path) on conflict do nothing;
 update public.moments set photo_path=p_photo_path,photo_revision=gen_random_uuid(),selected_caption_id=null,caption_override=null,
 context=btrim(p_context),style=p_style,updated_at=now() where id=m.id;
 return m.id;
end $$;
create or replace function public.caption_reserve(p_user_id uuid,p_moment_id uuid,p_request_key uuid,p_system_prompt text,p_user_prompt text,p_model text,p_settings jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.moments; r public.generation_requests; d date:=(now() at time zone 'America/New_York')::date;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 if not exists(select 1 from public.profiles where id=p_user_id and username_claimed and nullif(btrim(username),'') is not null and nullif(btrim(display_name),'') is not null) then raise exception 'Complete your profile.'; end if;
 select * into r from public.generation_requests where creator_id=p_user_id and request_key=p_request_key;
 if found then
  if r.moment_id is distinct from p_moment_id or r.system_prompt<>p_system_prompt or (r.user_prompt::jsonb-'previousCaptions')<>(p_user_prompt::jsonb-'previousCaptions') or r.model<>p_model or r.settings<>p_settings then raise exception 'Request key belongs to different inputs.'; end if;
  return jsonb_build_object('id',r.id,'state',r.state,'reused',true,'run_id',r.run_id);
 end if;
 update public.generation_requests set state='expired' where creator_id=p_user_id and state='pending' and lease_expires_at<=now();
 if exists(select 1 from public.generation_requests where creator_id=p_user_id and state='pending') then raise exception 'A generation is already running. Please wait.'; end if;
 select * into m from public.moments where id=p_moment_id and creator_id=p_user_id and status='draft' for update;
 if not found then raise exception 'Draft is unavailable.'; end if;
 -- Prompts must describe the exact saved input snapshot, even if another tab saved it.
 if (p_user_prompt::jsonb->>'context') is distinct from m.context or (p_user_prompt::jsonb->>'style') is distinct from m.style or (p_user_prompt::jsonb->>'photoRevision') is distinct from m.photo_revision::text then raise exception 'Draft changed. Save and try again.'; end if;
 insert into public.generation_requests(creator_id,moment_id,request_key,quota_date,state,lease_expires_at,photo_revision,photo_path,context,style,system_prompt,user_prompt,model,settings)
 values(p_user_id,m.id,p_request_key,d,'pending',now()+interval '2 minutes',m.photo_revision,m.photo_path,m.context,m.style,p_system_prompt,p_user_prompt,p_model,p_settings) returning * into r;
 return jsonb_build_object('id',r.id,'state',r.state,'reused',false,'photo_revision',r.photo_revision);
end $$;
create or replace function public.caption_finish(p_user_id uuid,p_request_id uuid,p_captions jsonb) returns uuid language plpgsql security definer set search_path='' as $$
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
 insert into public.generation_runs(moment_id,creator_id,photo_revision,photo_path,request_key,context,style,system_prompt,user_prompt,model,settings)
 values(m.id,p_user_id,r.photo_revision,r.photo_path,r.request_key,r.context,r.style,r.system_prompt,r.user_prompt,r.model,r.settings) returning id into run;
 insert into public.captions(generation_run_id,moment_id,creator_id,ordinal,text)
 select run,m.id,p_user_id,n::smallint,btrim(x#>>'{}') from jsonb_array_elements(p_captions) with ordinality as e(x,n);
 update public.generation_requests set state='succeeded',run_id=run where id=r.id;
 return run;
end $$;
create or replace function public.brainrot_publish(p_moment_id uuid,p_caption_id uuid,p_text text,p_rendered_path text)
returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.caption_require_user(); m public.moments; r public.generation_runs;
begin
 select * into m from public.moments where id=p_moment_id and creator_id=u for update;
 if not found then raise exception 'Meme is unavailable.' using errcode='42501'; end if;
 if m.status='published' then
  if m.selected_caption_id=p_caption_id and m.caption_override=btrim(p_text) then return; end if;
  raise exception 'Published memes cannot change.';
 end if;
 if p_text is null or char_length(btrim(p_text)) not between 1 and 240 then raise exception 'Use 1–240 characters.'; end if;
 if p_rendered_path is null or p_rendered_path not like (u::text||'/'||m.id::text||'/%') or not exists(select 1 from storage.objects where bucket_id='caption-photos' and name=p_rendered_path) then raise exception 'Rendered image is unavailable.' using errcode='42501'; end if;
 select g.* into r from public.generation_runs g join public.captions c on c.generation_run_id=g.id where c.id=p_caption_id and c.moment_id=m.id and g.photo_revision=m.photo_revision;
 if not found then raise exception 'Choose a caption generated for this photo.'; end if;
 update public.moments set status='published',selected_caption_id=p_caption_id,caption_override=btrim(p_text),rendered_path=p_rendered_path,
 public_style=r.style,author_name=(select coalesce(nullif(display_name,''),first_name) from public.profiles where id=u),published_at=now(),updated_at=now() where id=m.id;
end $$;
create or replace function public.brainrot_discover(p_sort text default 'new',p_query text default null,p_username text default null,p_id uuid default null,p_offset integer default 0,p_exclude uuid[] default '{}')
returns jsonb language sql stable security definer set search_path='' as $$
 with votes as (select caption_id,sum(value) score,count(*) filter(where value=1) upvotes,count(*) filter(where value=-1) downvotes from public.caption_votes group by caption_id),
 candidates as (
 select m.id,m.published_at,m.creator_id,p.username,
 case when p_sort='top' then coalesce(v.score,0)::double precision
 when p_sort='trending' then (greatest(coalesce(v.score,0),0)+1)::double precision/power(greatest(extract(epoch from (now()-m.published_at))/3600,0)+2,1.3) else 0 end rank_score,
 row_number() over(partition by m.creator_id order by m.published_at desc,m.id desc) creator_order,
 jsonb_build_object('id',m.id,'caption_id',c.id,'text',coalesce(m.caption_override,c.text),'photo_path',m.photo_path,'rendered_path',m.rendered_path,
 'style',m.public_style,'author_name',coalesce(nullif(p.display_name,''),m.author_name),'username',p.username,
 'avatar_path',p.public_avatar_path,'published_at',m.published_at,'score',coalesce(v.score,0),'upvotes',coalesce(v.upvotes,0),'downvotes',coalesce(v.downvotes,0),
 'own',coalesce(m.creator_id=auth.uid(),false),'vote',(select value from public.caption_votes mine where mine.caption_id=c.id and mine.user_id=auth.uid())) row_data
 from public.moments m join public.captions c on c.id=m.selected_caption_id and c.moment_id=m.id
 join public.profiles p on p.id=m.creator_id left join votes v on v.caption_id=c.id
 where m.status='published' and (p_id is null or m.id=p_id) and (p_username is null or p.username=lower(p_username))
 and (nullif(btrim(p_query),'') is null or position(lower(left(p_query,80)) in lower(p.username||' '||p.display_name||' '||coalesce(m.caption_override,c.text)))>0)
 and (p_sort<>'swipe' or ((auth.uid() is null or m.creator_id<>auth.uid()) and not exists(select 1 from public.caption_votes mine where mine.caption_id=c.id and mine.user_id=auth.uid())))
 and not(m.id=any(coalesce(p_exclude,'{}'::uuid[])))
 ), limited as (select * from candidates order by case when p_sort='swipe' then creator_order else 0 end,rank_score desc,published_at desc,id desc limit 20 offset greatest(0,least(p_offset,10000)))
 select coalesce(jsonb_agg(row_data order by case when p_sort='swipe' then creator_order else 0 end,rank_score desc,published_at desc,id desc),'[]'::jsonb) from limited;
$$;
-- Purge retired structured location values from stored effective prompt snapshots too.
-- Original non-location caption text and prompts remain unchanged.
do $$ declare row record; cleaned text; t text; begin
 foreach t in array array['generation_runs','generation_requests'] loop
  for row in execute format('select id,user_prompt from public.%I',t) loop
   begin cleaned:=(row.user_prompt::jsonb-'location'-'country_code')::text;
   exception when invalid_text_representation then cleaned:='[Legacy prompt redacted when retiring location metadata]'; end;
   execute format('update public.%I set user_prompt=$1 where id=$2',t) using cleaned,row.id;
  end loop;
 end loop;
end $$;
alter table public.moments drop column country_code,drop column location,drop column public_location;
alter table public.generation_runs drop column location;
alter table public.generation_requests drop column location;
drop table public.country_visits;
drop table public.travel_countries;
drop table if exists public.most_populous_countries;
alter table public.generation_runs alter column prompt_version set default 'brainrot-v3';
revoke all on function public.brainrot_save_draft(uuid,text,text,uuid,uuid) from public,anon;
grant execute on function public.brainrot_save_draft(uuid,text,text,uuid,uuid) to authenticated;
revoke all on function public.caption_replace_photo(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.caption_replace_photo(uuid,uuid,text,text,text) to service_role;
commit;
