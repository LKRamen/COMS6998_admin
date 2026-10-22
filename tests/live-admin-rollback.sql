-- Run only through supabase-coms6998. Reuses an existing Google admin session.
-- All synthetic media and audit entries are rolled back; Storage is untouched.
begin;
do $$ declare u uuid; sid uuid; begin
 select p.id,s.id into u,sid from public.profiles p join auth.users a on a.id=p.id
 join auth.sessions s on s.user_id=p.id where p.is_superadmin and a.email='lkr2124@columbia.edu'
 order by s.created_at desc limit 1;
 if u is null then raise exception 'Existing admin session required'; end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','session_id',sid,
 'app_metadata',jsonb_build_object('provider','google'),'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
end $$;
set local role authenticated;
do $$ declare m uuid:=gen_random_uuid(); u uuid:=auth.uid(); payload jsonb; before_row jsonb; after_row jsonb; begin
 assert public.admin_access()=true,'Admin authorization failed';
 assert (public.admin_read('users')->>'total')::integer>=1,'Profile directory unavailable';
 assert public.admin_read('votes') ? 'rows','Vote ledger unavailable';
 payload:=jsonb_build_object('context','Disposable rollback verification','style','Funny','status','draft',
 'photo_path',u::text||'/'||m::text||'-test.jpg','rendered_path',u::text||'/'||m::text||'-render.jpg',
 'captions',jsonb_build_array('Rollback caption one','Rollback caption two','Rollback caption three'),
 'system_prompt','Synthetic verification provenance','user_prompt','{}','model','verification-only','settings','{}'::jsonb);
 perform public.admin_media('create',m,payload);
 before_row:=public.admin_read('media','',0,m)->'rows'->0;
 assert before_row->>'id'=m::text,'Created media unreadable';
 assert before_row->>'generated_caption'='Rollback caption one','Generation provenance missing';
 begin
  perform public.admin_media('update',m,payload||jsonb_build_object('caption','Edited caption','updated_at','2000-01-01'));
  raise exception 'Stale update accepted';
 exception when serialization_failure then null; end;
 perform public.admin_media('update',m,payload||jsonb_build_object('caption','Edited caption','updated_at',before_row->>'updated_at'));
 after_row:=public.admin_read('media','',0,m)->'rows'->0;
 assert after_row->>'caption'='Edited caption','Media update failed';
 assert after_row->>'generated_caption'='Rollback caption one','Original generation was overwritten';
 perform public.admin_media('delete',m,jsonb_build_object('updated_at',after_row->>'updated_at'));
 assert jsonb_array_length(public.admin_read('media','',0,m)->'rows')=0,'Media deletion failed';
 assert (select count(*) from public.captions where moment_id=m)=0,'Deleted media retained captions';
end $$;
reset role;
do $$ declare u uuid; begin
 select id into u from public.profiles where not is_superadmin limit 1;
 if u is null then raise exception 'Existing member required'; end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated',
 'app_metadata',jsonb_build_object('provider','google'),'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
end $$;
set local role authenticated;
do $$ begin
 begin perform public.admin_read(); raise exception 'Member admin read accepted'; exception when insufficient_privilege then null; end;
 begin update public.profiles set is_superadmin=true where id=auth.uid(); raise exception 'Self promotion accepted'; exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
 begin perform public.admin_read(); raise exception 'Guest admin read accepted'; exception when insufficient_privilege then null; end;
 begin perform public.admin_media('create',gen_random_uuid(),'{}'); raise exception 'Guest mutation accepted'; exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'PASS: live admin profile/vote reads, media CRUD, provenance, stale-write guard, guest/member denial and blocked self-promotion; synthetic changes rolled back' as result;
