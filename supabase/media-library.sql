-- Full-library filters and ordering, before pagination. Existing detail reader stays unchanged.
create or replace function public.admin_media_library(p_query text default '', p_page integer default 0,
 p_style text default '', p_status text default '', p_reactions text default '', p_sort text default 'newest')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; total bigint; pg integer:=greatest(0,least(coalesce(p_page,0),100000)); styles jsonb;
begin
 perform private.require_superadmin();
 if p_status not in ('','draft','published') or p_reactions not in ('','rated','unrated')
 or p_sort not in ('newest','oldest','upvotes_desc','upvotes_asc') then
  raise exception 'Invalid media filters.' using errcode='22023';
 end if;
 select coalesce(jsonb_agg(style order by style),'[]') into styles from (select distinct style from public.moments) s;
 with media as (
  select m.id,m.creator_id,m.photo_path,m.rendered_path,m.selected_caption_id,m.context,m.style,m.status,
   m.created_at,m.updated_at,m.published_at,p.username,p.display_name,
   coalesce(m.caption_override,c.text,'') caption,
   (select count(*) from public.caption_votes where caption_id=m.selected_caption_id and value=1) upvotes,
   (select count(*) from public.caption_votes where caption_id=m.selected_caption_id and value=-1) downvotes
  from public.moments m left join public.profiles p on p.id=m.creator_id left join public.captions c on c.id=m.selected_caption_id
  where (p_style='' or m.style=p_style) and (p_status='' or m.status=p_status)
   and concat_ws(' ',m.context,m.style,p.username,m.caption_override,c.text,m.id) ilike '%'||left(coalesce(p_query,''),100)||'%'
 ), filtered as (
  select * from media where p_reactions='' or (p_reactions='unrated' and upvotes+downvotes=0) or (p_reactions='rated' and upvotes+downvotes>0)
 ), numbered as (
  select *,row_number() over(order by
   case when p_sort='upvotes_desc' then upvotes end desc,
   case when p_sort='upvotes_asc' then upvotes end asc,
   case when p_sort='oldest' then created_at end asc,
   created_at desc,id) rn from filtered
 )
 select count(*),coalesce(jsonb_agg(to_jsonb(n)-'rn' order by rn) filter(where rn>pg*24 and rn<=(pg+1)*24),'[]')
 into total,result from numbered n;
 return jsonb_build_object('rows',result,'total',total,'page',pg,'page_size',24,'styles',styles);
end $$;
revoke all on function public.admin_media_library(text,integer,text,text,text,text) from public,anon;
grant execute on function public.admin_media_library(text,integer,text,text,text,text) to authenticated;
