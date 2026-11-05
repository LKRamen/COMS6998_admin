-- Explicitly requested assignment dummy data. Apply through supabase-coms6998.
-- Upload the 48 corresponding caption-photos objects before applying.
-- No existing accounts, publications, votes, or access policies are modified.
begin;
do $$
declare
 i integer; j integer; owner_id uuid; media_id uuid; run_id uuid; caption_id uuid;
 profile_id uuid; seed_time timestamptz; media_time timestamptz; style_name text;
 seed_tag constant text := 'assignment-dummy-2026-11-05';
begin
 if exists(select 1 from auth.users where raw_app_meta_data->>'seed_batch'=seed_tag) then
   raise exception 'This seed batch already exists; inspect it rather than inserting twice.';
 end if;
 seed_time := date_trunc('day',now() at time zone 'UTC') at time zone 'UTC' - interval '13 days';
 for i in 0..17 loop
   profile_id := md5(seed_tag||':profile:'||i)::uuid;
   insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,banned_until)
   values(profile_id,'authenticated','authenticated','assignment_dummy_'||lpad((i+1)::text,2,'0')||'@example.invalid',
     jsonb_build_object('seed_batch',seed_tag),jsonb_build_object('synthetic',true),seed_time,seed_time,'2099-01-01');
   -- The normal Auth insert trigger creates the profile first.
   update public.profiles set username='assignment_dummy_'||lpad((i+1)::text,2,'0'),
     display_name='Dummy Student '||lpad((i+1)::text,2,'0'),
     bio='Fictional assignment data. Not a real account.',username_claimed=true,
     created_at=seed_time,updated_at=seed_time where id=profile_id;
 end loop;
 for i in 0..23 loop
   owner_id:=md5(seed_tag||':profile:'||(i%18))::uuid;
   media_id:=md5(seed_tag||':media:'||i)::uuid;
   run_id:=md5(seed_tag||':run:'||i)::uuid;
   caption_id:=md5(seed_tag||':caption:'||i||':1')::uuid;
   media_time:=seed_time+((i%14)||' days')::interval+interval '1 hour';
   style_name:=(array['Brainrot','Dry sarcasm','College life','Relatable'])[1+i%4];
   insert into public.moments(id,creator_id,photo_path,context,style,created_at,updated_at)
   values(media_id,owner_id,owner_id||'/'||seed_tag||'/source-'||i||'.jpg',
     'Fictional assignment data: illustrated study desk '||(i+1),style_name,media_time,media_time);
   insert into public.generation_runs(id,moment_id,creator_id,photo_revision,photo_path,request_key,context,style,
     system_prompt,user_prompt,provider,model,prompt_version,settings,created_at)
   select run_id,id,creator_id,photo_revision,photo_path,run_id,context,style,
     'Synthetic assignment fixture; no AI model was called.','Dummy caption input '||(i+1),
     'assignment-fixture','synthetic-no-model','assignment-dummy-v1',jsonb_build_object('seed_batch',seed_tag,'synthetic',true),media_time
   from public.moments where id=media_id;
   for j in 1..3 loop
     insert into public.captions(id,generation_run_id,moment_id,creator_id,ordinal,text)
     values(md5(seed_tag||':caption:'||i||':'||j)::uuid,run_id,media_id,owner_id,j,
       '[Dummy '||(i+1)||'.'||j||'] '||(array['My deadline has a better social life than I do.','Opened the laptop. That counts as progress.','The coffee is carrying this group project.'])[j]);
   end loop;
   update public.moments set selected_caption_id=caption_id,rendered_path=owner_id||'/'||seed_tag||'/render-'||i||'.jpg',
     public_style=style,author_name='Dummy Student '||lpad(((i%18)+1)::text,2,'0'),
     status='draft',published_at=null where id=media_id;
   insert into public.generation_requests(creator_id,moment_id,request_key,quota_date,state,lease_expires_at,
     photo_revision,photo_path,context,style,system_prompt,user_prompt,model,settings,run_id,created_at)
   select owner_id,media_id,run_id,media_time::date,'succeeded',media_time+interval '5 minutes',
     photo_revision,photo_path,context,style,system_prompt,user_prompt,model,settings,run_id,media_time
   from public.generation_runs where id=run_id;
   if i<20 then
     for j in 1..(8+i%9) loop
       insert into public.caption_votes(user_id,caption_id,value,created_at,updated_at)
       values(md5(seed_tag||':profile:'||((i+j)%18))::uuid,caption_id,
         case when (i+j)%4=0 then -1 else 1 end,media_time+interval '30 minutes',media_time+interval '30 minutes');
     end loop;
   end if;
 end loop;
 for i in 0..5 loop
   insert into public.generation_requests(creator_id,moment_id,request_key,quota_date,state,lease_expires_at,
     photo_revision,photo_path,context,style,system_prompt,user_prompt,model,settings,run_id,created_at,error_message)
   select creator_id,moment_id,md5(seed_tag||':failed:'||i)::uuid,created_at::date,'failed',created_at+interval '5 minutes',
     photo_revision,photo_path,context,style,system_prompt,user_prompt,model,settings,null,created_at,
     'Synthetic assignment failure: example provider timeout.'
   from public.generation_runs where id=md5(seed_tag||':run:'||i)::uuid;
 end loop;
end $$;
commit;
