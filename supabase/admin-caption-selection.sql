-- Keep caption provenance attached to the option chosen in the draft editor.
begin;
create or replace function public.admin_media(p_action text,p_id uuid,p_data jsonb default '{}'::jsonb) returns jsonb
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
   c:=m.selected_caption_id;
   if nullif(p_data->>'selected_caption_id','') is not null then
    c:=(p_data->>'selected_caption_id')::uuid;
    if c is distinct from m.selected_caption_id and m.status<>'draft' then
     raise exception 'Only drafts can select a different AI caption.' using errcode='22023';
    end if;
    if not exists(select 1 from public.captions cc join public.generation_runs gr on gr.id=cc.generation_run_id
      where cc.id=c and cc.moment_id=m.id and gr.photo_revision=m.photo_revision and gr.photo_path=m.photo_path) then
     raise exception 'Choose a caption generated for the current photo.' using errcode='22023';
    end if;
   end if;
   update public.moments set selected_caption_id=c,context=p_data->>'context',style=p_data->>'style',public_style=p_data->>'style',caption_override=btrim(p_data->>'caption'),
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

commit;
