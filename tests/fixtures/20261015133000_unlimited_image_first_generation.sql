-- Remove the app daily quota; keep authentication, single-flight, leases and idempotence.
begin;
create or replace function public.caption_reserve(p_user_id uuid,p_moment_id uuid,p_request_key uuid,p_system_prompt text,p_user_prompt text,p_model text,p_settings jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.moments; r public.generation_requests; d date:=(now() at time zone 'America/New_York')::date;
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
 select * into m from public.moments where id=p_moment_id and creator_id=p_user_id and status='draft' for update;
 if not found then raise exception 'Draft is unavailable.'; end if;
 -- Prompts must describe the exact saved input snapshot, even if another tab saved it.
 if (p_user_prompt::jsonb->>'context') is distinct from m.context or (p_user_prompt::jsonb->>'location') is distinct from m.location or (p_user_prompt::jsonb->>'style') is distinct from m.style or (p_user_prompt::jsonb->>'photoRevision') is distinct from m.photo_revision::text then raise exception 'Draft changed. Save and try again.'; end if;
 insert into public.generation_requests(creator_id,moment_id,request_key,quota_date,state,lease_expires_at,photo_revision,photo_path,context,location,style,system_prompt,user_prompt,model,settings)
 values(p_user_id,m.id,p_request_key,d,'pending',now()+interval '2 minutes',m.photo_revision,m.photo_path,m.context,m.location,m.style,p_system_prompt,p_user_prompt,p_model,p_settings) returning * into r;
 return jsonb_build_object('id',r.id,'state',r.state,'reused',false,'photo_revision',r.photo_revision);
end $$;

create or replace function public.caption_allowance() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.caption_require_user();
 return jsonb_build_object('remaining',null,'reset_at',null,'unlimited',true);
end $$;
alter table public.generation_runs alter column prompt_version set default 'brainrot-v2';
commit;
