-- Shared project: swmgfanscadzfkqoctle. Additive admin boundary; no ordinary policies widened.
begin;
alter table public.profiles add column if not exists is_superadmin boolean not null default false;

create or replace function private.protect_superadmin() returns trigger language plpgsql set search_path='' as $$
begin
 if (case when TG_OP='INSERT' then new.is_superadmin else new.is_superadmin is distinct from old.is_superadmin end)
 and current_user not in ('postgres','supabase_admin','service_role') then
  raise exception 'Admin privileges can only be changed through trusted database access.' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function private.protect_superadmin() from public,anon,authenticated;
create trigger profiles_protect_superadmin before insert or update on public.profiles for each row execute function private.protect_superadmin();

create table private.admin_audit (
 id uuid primary key default gen_random_uuid(), actor_id uuid not null, action text not null,
 media_id uuid not null, created_at timestamptz not null default now()
);
alter table private.admin_audit enable row level security;
revoke all on private.admin_audit from public,anon,authenticated;

create or replace function private.require_superadmin() returns uuid language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); claims jsonb:=auth.jwt();
begin
 if u is null or claims->'app_metadata'->>'provider' is distinct from 'google'
 or not coalesce(claims->'amr','[]'::jsonb) @> '[{"method":"oauth"}]'::jsonb
 or not exists(select 1 from public.profiles where id=u and is_superadmin)
 or not exists(select 1 from auth.sessions where id=(claims->>'session_id')::uuid and user_id=u)
 then raise exception 'Google superadmin access required.' using errcode='42501'; end if;
 return u;
end $$;
revoke all on function private.require_superadmin() from public,anon,authenticated;

create function public.admin_access() returns boolean language plpgsql stable security definer set search_path='' as $$
begin perform private.require_superadmin(); return true; end $$;
revoke all on function public.admin_access() from public,anon;
grant execute on function public.admin_access() to authenticated;

create function public.admin_read(p_kind text default 'overview',p_query text default '',p_page integer default 0,p_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; total bigint; q text:='%'||left(coalesce(p_query,''),100)||'%'; off integer:=greatest(0,least(coalesce(p_page,0),100000))*24;
begin
 perform private.require_superadmin();
 if p_kind='users' then
  select count(*) into total from public.profiles p left join auth.users u on u.id=p.id where concat_ws(' ',p.username,p.display_name,u.email,p.id) ilike q;
  select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (
   select p.id,p.username,p.display_name,p.first_name,p.last_name,p.bio,p.created_at,p.is_superadmin,u.email,u.last_sign_in_at,
    (select count(*) from public.moments where creator_id=p.id) media_count,
    (select count(*) from public.caption_votes where user_id=p.id) vote_count
   from public.profiles p left join auth.users u on u.id=p.id where concat_ws(' ',p.username,p.display_name,u.email,p.id) ilike q
   order by p.created_at desc,p.id limit 24 offset off
  ) t;
 elsif p_kind='media' then
  select count(*) into total from public.moments m left join public.profiles p on p.id=m.creator_id left join public.captions c on c.id=m.selected_caption_id
   where (p_id is null or m.id=p_id) and concat_ws(' ',m.context,m.style,p.username,m.caption_override,c.text,m.id) ilike q;
  select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (
   select m.id,m.creator_id,m.photo_path,m.rendered_path,m.context,m.style,m.status,m.selected_caption_id,m.caption_override,m.created_at,m.updated_at,m.published_at,
    p.username,p.display_name,c.text generated_caption,coalesce(m.caption_override,c.text,'') caption,
    (select count(*) from public.caption_votes where caption_id=m.selected_caption_id and value=1) upvotes,
    (select count(*) from public.caption_votes where caption_id=m.selected_caption_id and value=-1) downvotes,
    (select jsonb_agg(jsonb_build_object('id',cc.id,'text',cc.text,'ordinal',cc.ordinal) order by cc.ordinal) from public.captions cc where cc.generation_run_id=c.generation_run_id) candidates,
    (select jsonb_build_object('provider',r.provider,'model',r.model,'prompt_version',r.prompt_version,'created_at',r.created_at) from public.generation_runs r where r.id=c.generation_run_id) generation
   from public.moments m left join public.profiles p on p.id=m.creator_id left join public.captions c on c.id=m.selected_caption_id
   where (p_id is null or m.id=p_id) and concat_ws(' ',m.context,m.style,p.username,m.caption_override,c.text,m.id) ilike q
   order by m.created_at desc,m.id limit 24 offset off
  ) t;
 elsif p_kind='votes' then
  select count(*) into total from public.caption_votes v join public.captions c on c.id=v.caption_id left join public.profiles p on p.id=v.user_id
   where concat_ws(' ',p.username,c.text,v.user_id,v.caption_id,case when v.value=1 then 'upvote' else 'downvote' end) ilike q;
  select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (
   select v.user_id,v.caption_id,v.value,v.created_at,v.updated_at,p.username,p.display_name,c.text,c.moment_id,
    coalesce(m.caption_override,c.text) visible_caption
   from public.caption_votes v join public.captions c on c.id=v.caption_id join public.moments m on m.id=c.moment_id left join public.profiles p on p.id=v.user_id
   where concat_ws(' ',p.username,c.text,v.user_id,v.caption_id,case when v.value=1 then 'upvote' else 'downvote' end) ilike q
   order by v.updated_at desc,v.user_id,v.caption_id limit 24 offset off
  ) t;
 elsif p_kind='overview' then
  return jsonb_build_object(
   'profiles',(select count(*) from public.profiles), 'media',(select count(*) from public.moments),
   'published',(select count(*) from public.moments where status='published'), 'drafts',(select count(*) from public.moments where status='draft'),
   'generations',(select count(*) from public.generation_runs), 'votes',(select count(*) from public.caption_votes),
   'upvotes',(select count(*) from public.caption_votes where value=1), 'downvotes',(select count(*) from public.caption_votes where value=-1),
   'unrated',(select count(*) from public.moments m where status='published' and not exists(select 1 from public.caption_votes where caption_id=m.selected_caption_id)),
   'activity',(select coalesce(jsonb_agg(to_jsonb(a) order by "day"),'[]') from (
    select d::date as "day",(select count(*) from public.moments where created_at>=d and created_at<d+interval '1 day') media,
     (select count(*) from public.caption_votes where created_at>=d and created_at<d+interval '1 day') votes
    from generate_series(date_trunc('day',now() at time zone 'UTC')-interval '13 days',date_trunc('day',now() at time zone 'UTC'),interval '1 day') d
   ) a),
   'styles',(select coalesce(jsonb_agg(to_jsonb(s) order by s.total desc),'[]') from (
    select m.style,count(distinct m.id) total,count(v.*) votes,count(v.*) filter(where v.value=1) upvotes
    from public.moments m left join public.caption_votes v on v.caption_id=m.selected_caption_id group by m.style
   ) s),
   'top',(select coalesce(jsonb_agg(to_jsonb(t) order by score desc),'[]') from (
    select m.id,coalesce(m.caption_override,c.text) caption,p.username,count(v.*) votes,coalesce(sum(v.value),0) score,
     count(v.*) filter(where v.value=1) upvotes,count(v.*) filter(where v.value=-1) downvotes
    from public.moments m join public.captions c on c.id=m.selected_caption_id left join public.profiles p on p.id=m.creator_id left join public.caption_votes v on v.caption_id=c.id
    where m.status='published' group by m.id,c.text,p.username order by score desc,votes desc,m.created_at desc limit 5
   ) t),
   'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by created_at desc),'[]') from (select a.action,a.media_id,a.created_at,p.display_name from private.admin_audit a left join public.profiles p on p.id=a.actor_id order by a.created_at desc limit 6) a)
  );
 else raise exception 'Unknown collection.' using errcode='22023'; end if;
 return jsonb_build_object('rows',result,'total',total,'page',off/24,'page_size',24);
end $$;
revoke all on function public.admin_read(text,text,integer,uuid) from public,anon;
grant execute on function public.admin_read(text,text,integer,uuid) to authenticated;

create function public.admin_media(p_action text,p_id uuid,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_superadmin(); m public.moments; r uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); txt text; i integer:=0; result jsonb;
begin
 if p_action='create' then
  if jsonb_array_length(p_data->'captions')<>3 or p_data->>'status' not in ('draft','published') or split_part(p_data->>'photo_path','/',1)<>u::text
   or split_part(p_data->>'rendered_path','/',1)<>u::text then raise exception 'Invalid media inputs.' using errcode='22023'; end if;
  insert into public.moments(id,creator_id,photo_path,context,style) values(p_id,u,p_data->>'photo_path',p_data->>'context',p_data->>'style');
  insert into public.generation_runs(id,moment_id,creator_id,photo_revision,photo_path,request_key,context,style,system_prompt,user_prompt,model,prompt_version,settings)
   select r,p_id,u,photo_revision,photo_path,gen_random_uuid(),context,style,p_data->>'system_prompt',p_data->>'user_prompt',p_data->>'model','brainrot-v3',p_data->'settings' from public.moments where id=p_id;
  for txt in select jsonb_array_elements_text(p_data->'captions') loop
   i:=i+1; insert into public.captions(id,generation_run_id,moment_id,creator_id,ordinal,text) values(case when i=1 then c else gen_random_uuid() end,r,p_id,u,i,txt);
  end loop;
  update public.moments set selected_caption_id=c,rendered_path=p_data->>'rendered_path',status=p_data->>'status',public_style=style,
   author_name=(select coalesce(nullif(display_name,''),username,'Admin') from public.profiles where id=u),published_at=case when p_data->>'status'='published' then now() else null end where id=p_id;
 elsif p_action in ('update','delete') then
  select * into m from public.moments where id=p_id for update;
  if not found then raise exception 'Media no longer exists.' using errcode='P0002'; end if;
  if m.updated_at is distinct from (p_data->>'updated_at')::timestamptz then raise exception 'Media changed in another tab. Reload before saving.' using errcode='40001'; end if;
  if p_action='delete' then
   result:=jsonb_build_object('photo_path',m.photo_path,'rendered_path',m.rendered_path);
   delete from public.moments where id=p_id;
  else
   if p_data->>'status' is null or p_data->>'status' not in ('draft','published') or nullif(btrim(p_data->>'caption'),'') is null
    or split_part(p_data->>'rendered_path','/',1)<>m.creator_id::text then raise exception 'Invalid media inputs.' using errcode='22023'; end if;
   update public.moments set context=p_data->>'context',style=p_data->>'style',public_style=p_data->>'style',caption_override=btrim(p_data->>'caption'),
    rendered_path=p_data->>'rendered_path',status=p_data->>'status',updated_at=clock_timestamp(),
    published_at=case when p_data->>'status'='published' then coalesce(m.published_at,now()) else null end,
    author_name=coalesce(m.author_name,(select coalesce(nullif(display_name,''),username,'Admin') from public.profiles where id=m.creator_id)) where id=p_id;
  end if;
 else raise exception 'Unknown operation.' using errcode='22023'; end if;
 insert into private.admin_audit(actor_id,action,media_id) values(u,p_action,p_id);
 return coalesce(result,jsonb_build_object('id',p_id));
end $$;
revoke all on function public.admin_media(text,uuid,jsonb) from public,anon;
grant execute on function public.admin_media(text,uuid,jsonb) to authenticated;

-- Bootstrap the existing account. There is deliberately no self-promotion API.
update public.profiles set is_superadmin=true
 where exists(select 1 from auth.users where id=profiles.id and email='lkr2124@columbia.edu' and raw_app_meta_data->>'provider'='google');
commit;
