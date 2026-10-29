-- Hosted verification using an existing authorized admin. Every test write is rolled back.
begin;
do $$ declare u uuid; sid uuid; begin
 select p.id,s.id into u,sid from public.profiles p join auth.users a on a.id=p.id join auth.sessions s on s.user_id=p.id where p.is_superadmin and a.email='lkr2124@columbia.edu' order by s.created_at desc limit 1;
 if u is null then raise exception 'Existing admin session required'; end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','session_id',sid,'app_metadata',jsonb_build_object('provider','google'),'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
end $$;
set local role authenticated;
do $$ declare kind text; r jsonb; updated jsonb; provider jsonb; model jsonb; input jsonb; begin
 foreach kind in array array['prompt_chains','prompt_chain_steps','prompt_chain_mix','terms','ai_generation_examples','llm_models','llm_providers','allowed_signup_domains','whitelisted_emails','generation_requests','llm_responses'] loop
  assert public.admin_catalog_read(kind) ? 'rows','Collection unavailable';
 end loop;
 foreach kind in array array['terms','ai_generation_examples','llm_providers','allowed_signup_domains','whitelisted_emails'] loop
  input:=case kind when 'terms' then '{"term":"rollback verification","definition":"temporary"}'::jsonb when 'ai_generation_examples' then '{"input":"rollback input","output":"rollback output","notes":"temporary"}'::jsonb when 'llm_providers' then '{"name":"rollback verification","api_base_url":"https://example.com"}'::jsonb when 'allowed_signup_domains' then '{"domain":"rollback-verification.example"}'::jsonb else '{"email":"rollback-verification@example.com"}'::jsonb end;
  r:=public.admin_catalog_write(kind,'create',null,input,null);
  assert (public.admin_catalog_read(kind,r->>'id')->>'total')::integer=1;
  updated:=public.admin_catalog_write(kind,'update',(r->>'id')::uuid,input,1);
  assert (updated->>'version')::integer=2;
  begin perform public.admin_catalog_write(kind,'delete',(r->>'id')::uuid,'{}',1);raise exception 'Stale delete accepted';exception when serialization_failure then null;end;
  perform public.admin_catalog_write(kind,'delete',(r->>'id')::uuid,'{}',2);
 end loop;
 provider:=public.admin_catalog_write('llm_providers','create',null,'{"name":"rollback model provider","api_base_url":"https://example.com"}',null);
 input:=jsonb_build_object('provider_id',provider->>'id','name','Rollback model','model_id','rollback-model','enabled',true);
 model:=public.admin_catalog_write('llm_models','create',null,input,null);
 updated:=public.admin_catalog_write('llm_models','update',(model->>'id')::uuid,input||'{"enabled":false}',1);
 assert updated->>'enabled'='false';
 perform public.admin_catalog_write('llm_models','delete',(model->>'id')::uuid,'{}',2);
 perform public.admin_catalog_write('llm_providers','delete',(provider->>'id')::uuid,'{}',1);
 r:=public.admin_catalog_read('prompt_chain_mix')->'rows'->0;
 updated:=public.admin_catalog_write('prompt_chain_mix','update',(r->>'id')::uuid,'{"weight":42,"enabled":false}',(r->>'version')::integer);
 assert updated->>'weight'='42';
 begin perform public.admin_catalog_write('generation_requests','delete',gen_random_uuid(),'{}',1);raise exception 'Read-only write accepted';exception when invalid_parameter_value then null;end;
end $$;
set local role anon;
do $$ begin
 begin perform public.admin_catalog_read('terms');raise exception 'Guest read accepted';exception when insufficient_privilege then null;end;
 begin perform public.admin_catalog_write('terms','create',null,'{}',null);raise exception 'Guest write accepted';exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'PASS: hosted catalog reads, CRUD, mix update, stale-write and guest denials; all test writes rolled back' as result;
