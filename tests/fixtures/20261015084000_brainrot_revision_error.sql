-- A stale input is not a transient serialization failure: return HTTP 400 without retrying.
create or replace function public.brainrot_save_draft(p_moment_id uuid,p_context text,p_location text,p_style text,p_selected_caption_id uuid,p_photo_revision uuid)
returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.caption_require_user(); m public.moments;
begin
 select * into m from public.moments where id=p_moment_id and creator_id=u and status='draft' for update;
 if not found then raise exception 'Draft is unavailable.' using errcode='42501'; end if;
 if p_photo_revision is distinct from m.photo_revision then raise exception 'This photo changed in another tab. Reload before saving.' using errcode='22023'; end if;
 perform public.caption_save_draft(p_moment_id,p_context,p_location,p_style,p_selected_caption_id);
end $$;
