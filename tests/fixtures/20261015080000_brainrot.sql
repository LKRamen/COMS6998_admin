-- Additive Brainrot evolution of the existing caption schema. Preserve all rows.
begin;
alter table public.profiles add column username text;
alter table public.profiles add column display_name text not null default '';
alter table public.profiles add column bio text not null default '' check(char_length(bio)<=240);
alter table public.profiles add column public_avatar_path text;
alter table public.profiles add column updated_at timestamptz not null default now();
update public.profiles set username='user_'||replace(id::text,'-',''),display_name=coalesce(nullif(btrim(first_name),''),'New creator');
alter table public.profiles alter column username set not null;
alter table public.profiles add constraint profile_username_format check(username ~ '^[a-z0-9_]{3,40}$');
alter table public.profiles add constraint profile_display_name_length check(char_length(display_name)<=80);
alter table public.profiles add constraint profile_public_avatar_owner check(public_avatar_path is null or split_part(public_avatar_path,'/',1)=id::text);
create unique index profiles_username_unique on public.profiles(lower(username));
create function private.brainrot_profile_defaults() returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.username:=coalesce(new.username,'user_'||replace(new.id::text,'-',''));
 return new;
end $$;
revoke all on function private.brainrot_profile_defaults() from public,anon,authenticated;
create trigger brainrot_profile_defaults before insert on public.profiles for each row execute function private.brainrot_profile_defaults();

create function public.brainrot_save_profile(p_username text,p_display_name text,p_bio text,p_avatar_path text default null)
returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if u is null then raise exception 'Sign in to edit your profile.' using errcode='42501'; end if;
 if p_username is null or lower(btrim(p_username)) !~ '^[a-z0-9_]{3,40}$' or p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 80 or p_bio is null or char_length(p_bio)>240 then raise exception 'Check your username, display name and bio.'; end if;
 if p_avatar_path is not null and (split_part(p_avatar_path,'/',1)<>u::text or not exists(select 1 from storage.objects where bucket_id='avatars' and name=p_avatar_path)) then raise exception 'Choose your own uploaded avatar.' using errcode='42501'; end if;
 insert into public.profiles(id,username,display_name,bio,first_name,last_name,public_avatar_path,avatar_path)
 values(u,lower(btrim(p_username)),btrim(p_display_name),btrim(p_bio),btrim(p_display_name),'Creator',p_avatar_path,p_avatar_path)
 on conflict(id) do update set username=excluded.username,display_name=excluded.display_name,bio=excluded.bio,
 first_name=coalesce(nullif(public.profiles.first_name,''),excluded.first_name),last_name=coalesce(nullif(public.profiles.last_name,''),'Creator'),
 public_avatar_path=excluded.public_avatar_path,avatar_path=coalesce(excluded.avatar_path,public.profiles.avatar_path),updated_at=now();
end $$;
revoke all on function public.brainrot_save_profile(text,text,text,text) from public,anon;
grant execute on function public.brainrot_save_profile(text,text,text,text) to authenticated;

-- Existing names, email and private avatar paths remain owner-readable only.
create function public.brainrot_profile(p_username text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'username',p.username,'display_name',p.display_name,'bio',p.bio,'avatar_path',p.public_avatar_path,'created_at',p.created_at,
 'memes',(select count(*) from public.moments m where m.creator_id=p.id and m.status='published'),
 'upvotes',(select count(*) from public.caption_votes v join public.moments m on m.selected_caption_id=v.caption_id where m.creator_id=p.id and m.status='published' and v.value=1))
 from public.profiles p where p.username=lower(p_username);
$$;
revoke all on function public.brainrot_profile(text) from public;
grant execute on function public.brainrot_profile(text) to anon,authenticated;

alter table public.moments drop constraint moments_style_check;
alter table public.moments add constraint moments_style_check check(style in ('Funny','Witty','Postcard','Brainrot','Dry sarcasm','Absurdist','College life','NYC','Relatable','Unhinged'));
alter table public.moments drop constraint published_country_required;
alter table public.moments add column caption_override text check(caption_override is null or char_length(btrim(caption_override)) between 1 and 240);
alter table public.moments add column rendered_path text unique;
alter table public.moments add constraint rendered_path_owner check(rendered_path is null or split_part(rendered_path,'/',1)=creator_id::text);
alter table public.generation_runs alter column prompt_version set default 'brainrot-v1';

create or replace function public.caption_save_draft(p_moment_id uuid,p_context text,p_location text,p_style text,p_selected_caption_id uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.caption_require_user(); m public.moments;
begin
 select * into m from public.moments where id=p_moment_id and creator_id=u for update;
 if not found or m.status<>'draft' then raise exception 'Draft is unavailable.' using errcode='42501'; end if;
 if char_length(p_context)>500 or char_length(p_location)>120 or p_style not in ('Funny','Witty','Postcard','Brainrot','Dry sarcasm','Absurdist','College life','NYC','Relatable','Unhinged') or p_context is null or p_location is null or p_style is null then raise exception 'Invalid draft inputs.'; end if;
 if p_selected_caption_id is not null and not exists(select 1 from public.captions c join public.generation_runs r on r.id=c.generation_run_id where c.id=p_selected_caption_id and c.moment_id=m.id and r.photo_revision=m.photo_revision) then raise exception 'Caption does not belong to this photo.'; end if;
 update public.moments set context=btrim(p_context),country_code=case when location=btrim(p_location) then country_code else null end,location=btrim(p_location),style=p_style,selected_caption_id=p_selected_caption_id,
 caption_override=case when selected_caption_id is not distinct from p_selected_caption_id then caption_override else null end,updated_at=now() where id=m.id;
end $$;

create function public.brainrot_save_caption(p_moment_id uuid,p_caption_id uuid,p_text text) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.caption_require_user(); m public.moments;
begin
 select * into m from public.moments where id=p_moment_id and creator_id=u and status='draft' for update;
 if not found then raise exception 'Draft is unavailable.' using errcode='42501'; end if;
 if p_text is null or char_length(btrim(p_text)) not between 1 and 240 then raise exception 'Use 1–240 characters.'; end if;
 if not exists(select 1 from public.captions c join public.generation_runs r on r.id=c.generation_run_id where c.id=p_caption_id and c.moment_id=m.id and r.photo_revision=m.photo_revision) then raise exception 'Choose a caption generated for this photo.'; end if;
 update public.moments set selected_caption_id=p_caption_id,caption_override=btrim(p_text),updated_at=now() where id=m.id;
end $$;
revoke all on function public.brainrot_save_caption(uuid,uuid,text) from public,anon;
grant execute on function public.brainrot_save_caption(uuid,uuid,text) to authenticated;

create function public.brainrot_publish(p_moment_id uuid,p_caption_id uuid,p_text text,p_rendered_path text)
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
 public_location=m.location,public_style=r.style,author_name=(select coalesce(nullif(display_name,''),first_name) from public.profiles where id=u),published_at=now(),updated_at=now() where id=m.id;
end $$;
revoke all on function public.brainrot_publish(uuid,uuid,text,text) from public,anon;
grant execute on function public.brainrot_publish(uuid,uuid,text,text) to authenticated;

create or replace function public.caption_photo_visible(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.moments where (photo_path=p_path or rendered_path=p_path) and (status='published' or creator_id=auth.uid()));
$$;

-- Public reads are explicit projections, never arbitrary reads of private tables.
create function public.brainrot_discover(p_sort text default 'new',p_query text default null,p_username text default null,p_id uuid default null,p_offset integer default 0,p_exclude uuid[] default '{}')
returns jsonb language sql stable security definer set search_path='' as $$
 with votes as (select caption_id,sum(value) score,count(*) filter(where value=1) upvotes,count(*) filter(where value=-1) downvotes from public.caption_votes group by caption_id),
 candidates as (
 select m.id,m.published_at,m.creator_id,p.username,
 case when p_sort='top' then coalesce(v.score,0)::double precision
 when p_sort='trending' then (greatest(coalesce(v.score,0),0)+1)::double precision/power(greatest(extract(epoch from (now()-m.published_at))/3600,0)+2,1.3) else 0 end rank_score,
 row_number() over(partition by m.creator_id order by m.published_at desc,m.id desc) creator_order,
 jsonb_build_object('id',m.id,'caption_id',c.id,'text',coalesce(m.caption_override,c.text),'photo_path',m.photo_path,'rendered_path',m.rendered_path,
 'location',m.public_location,'style',m.public_style,'author_name',coalesce(nullif(p.display_name,''),m.author_name),'username',p.username,
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
revoke all on function public.brainrot_discover(text,text,text,uuid,integer,uuid[]) from public;
grant execute on function public.brainrot_discover(text,text,text,uuid,integer,uuid[]) to anon,authenticated;

create or replace function public.caption_delete(p_moment_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.caption_require_user(); m public.moments;
begin
 select * into m from public.moments where id=p_moment_id and creator_id=u for update;
 if not found then return; end if;
 insert into public.photo_cleanup_requests(creator_id,photo_path) values(u,m.photo_path) on conflict do nothing;
 if m.rendered_path is not null then insert into public.photo_cleanup_requests(creator_id,photo_path) values(u,m.rendered_path) on conflict do nothing; end if;
 update public.generation_requests set state='failed' where moment_id=m.id and state='pending';
 delete from public.moments where id=m.id;
end $$;
commit;
