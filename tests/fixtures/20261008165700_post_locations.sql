alter table public.moments add column country_code text references public.travel_countries(code);
alter table public.moments add constraint published_country_required check(status <> 'published' or (country_code is not null and nullif(btrim(location),'') is not null));
alter table public.moments add constraint selected_location_label check(country_code is null or nullif(btrim(location),'') is not null);
create index moments_published_country on public.moments(country_code,published_at desc) where status='published';

create function public.caption_set_location(p_moment_id uuid,p_label text,p_country_code text) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.caption_require_user(); m public.moments;
begin
 select * into m from public.moments where id=p_moment_id and creator_id=u for update;
 if not found then raise exception 'Post is unavailable.' using errcode='42501'; end if;
 if p_label is null or char_length(p_label)>120 then raise exception 'Invalid location.'; end if;
 if p_country_code is not null and (nullif(btrim(p_label),'') is null or not exists(select 1 from public.travel_countries where code=p_country_code)) then raise exception 'Select a place or country from the location results.'; end if;
 if m.status='published' and p_country_code is null then raise exception 'Published posts require a location.'; end if;
 update public.moments set location=btrim(p_label),country_code=p_country_code,
 public_location=case when status='published' then btrim(p_label) else public_location end,updated_at=now() where id=m.id;
end $$;
revoke all on function public.caption_set_location(uuid,text,text) from public,anon;
grant execute on function public.caption_set_location(uuid,text,text) to authenticated;

create or replace function public.caption_save_draft(p_moment_id uuid,p_context text,p_location text,p_style text,p_selected_caption_id uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.caption_require_user(); m public.moments;
begin
 select * into m from public.moments where id=p_moment_id and creator_id=u for update;
 if not found or m.status<>'draft' then raise exception 'Draft is unavailable.' using errcode='42501'; end if;
 if char_length(p_context)>500 or char_length(p_location)>120 or p_style not in ('Funny','Witty','Postcard') or p_context is null or p_location is null or p_style is null then raise exception 'Invalid draft inputs.'; end if;
 if p_selected_caption_id is not null and not exists(select 1 from public.captions c join public.generation_runs r on r.id=c.generation_run_id where c.id=p_selected_caption_id and c.moment_id=m.id and r.photo_revision=m.photo_revision) then raise exception 'Caption does not belong to this photo.'; end if;
 update public.moments set context=btrim(p_context),country_code=case when location=btrim(p_location) then country_code else null end,location=btrim(p_location),style=p_style,selected_caption_id=p_selected_caption_id,updated_at=now() where id=m.id;
end $$;

create or replace function public.caption_publish(p_moment_id uuid,p_caption_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.caption_require_user(); m public.moments; r public.generation_runs;
begin
 select * into m from public.moments where id=p_moment_id and creator_id=u for update;
 if not found then raise exception 'Post is unavailable.' using errcode='42501'; end if;
 if m.status='published' then
  if m.selected_caption_id=p_caption_id then return; end if;
  raise exception 'Published captions cannot change.';
 end if;
 if m.country_code is null or nullif(btrim(m.location),'') is null then raise exception 'Select a location before publishing.'; end if;
 select g.* into r from public.generation_runs g join public.captions c on c.generation_run_id=g.id where c.id=p_caption_id and c.moment_id=m.id and g.photo_revision=m.photo_revision;
 if not found then raise exception 'Choose a caption generated for this photo.'; end if;
 update public.moments set status='published',selected_caption_id=p_caption_id,public_location=m.location,public_style=r.style,
 author_name=(select btrim(first_name) from public.profiles where id=u),published_at=now(),updated_at=now() where id=m.id;
end $$;

create function public.caption_replace_photo_location(p_user_id uuid,p_moment_id uuid,p_photo_path text,p_context text,p_location text,p_style text,p_country_code text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if p_country_code is not null and (nullif(btrim(p_location),'') is null or not exists(select 1 from public.travel_countries where code=p_country_code)) then raise exception 'Invalid location.'; end if;
 update public.moments set country_code=null where id=p_moment_id and creator_id=p_user_id and status='draft';
 result:=public.caption_replace_photo(p_user_id,p_moment_id,p_photo_path,p_context,p_location,p_style);
 update public.moments set country_code=p_country_code where id=result;
 return result;
end $$;
revoke all on function public.caption_replace_photo_location(uuid,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.caption_replace_photo_location(uuid,uuid,text,text,text,text,text) to service_role;

create or replace function public.community_country_visits() returns table(country_code text,visitor_count bigint) language sql stable security definer set search_path='' as $$
 select m.country_code,count(*) from public.moments m where m.status='published' and m.country_code is not null group by m.country_code;
$$;
revoke all on function public.community_country_visits() from public;
grant execute on function public.community_country_visits() to anon,authenticated;
revoke insert,update,delete on public.country_visits from anon,authenticated;

create function public.caption_feed_country(p_sort text default 'new',p_offset integer default 0,p_country_code text default null) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(row_data order by rank_score desc,published_at desc,id desc),'[]'::jsonb) from (
  select m.id,m.published_at,case when p_sort='top' then coalesce(sum(v.value),0) else 0 end rank_score,
   jsonb_build_object('id',m.id,'caption_id',c.id,'text',c.text,'photo_path',m.photo_path,'location',m.public_location,
   'style',m.public_style,'author_name',m.author_name,'published_at',m.published_at,'score',coalesce(sum(v.value),0)) row_data
  from public.moments m join public.captions c on c.id=m.selected_caption_id and c.moment_id=m.id
  left join public.caption_votes v on v.caption_id=c.id
  where m.status='published' and (p_country_code is null or m.country_code=p_country_code) and (p_sort<>'top' or m.published_at>=now()-interval '168 hours')
  group by m.id,c.id order by rank_score desc,m.published_at desc,m.id desc limit 20 offset greatest(0,least(p_offset,10000))
 ) feed;
$$;
revoke all on function public.caption_feed_country(text,integer,text) from public;
grant execute on function public.caption_feed_country(text,integer,text) to anon,authenticated;
