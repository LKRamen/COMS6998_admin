-- Keep normalized source-photo replacement compatible with new humor styles.
create or replace function public.caption_replace_photo(p_user_id uuid,p_moment_id uuid,p_photo_path text,p_context text,p_location text,p_style text)
returns uuid language plpgsql security definer set search_path='' as $$
declare m public.moments;
begin
 select * into m from public.moments where id=p_moment_id and creator_id=p_user_id and status='draft' for update;
 if not found then raise exception 'Draft is unavailable.'; end if;
 if p_photo_path is null or split_part(p_photo_path,'/',1)<>p_user_id::text or p_photo_path=m.photo_path then raise exception 'Invalid photo path.'; end if;
 if p_context is null or p_location is null or p_style is null or char_length(p_context)>500 or char_length(p_location)>120 or p_style not in ('Funny','Witty','Postcard','Brainrot','Dry sarcasm','Absurdist','College life','NYC','Relatable','Unhinged') then raise exception 'Invalid draft inputs.'; end if;
 insert into public.photo_cleanup_requests(creator_id,photo_path) values(p_user_id,m.photo_path) on conflict do nothing;
 update public.moments set photo_path=p_photo_path,photo_revision=gen_random_uuid(),selected_caption_id=null,caption_override=null,
 context=btrim(p_context),location=btrim(p_location),style=p_style,updated_at=now() where id=m.id;
 return m.id;
end $$;
