import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const admin='00000000-0000-4000-8000-000000000001',member='00000000-0000-4000-8000-000000000002',sid='99999999-0000-4000-8000-000000000001';
async function session(id,provider='google',method='oauth') {
 await db.exec('reset role');
 await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[id??'',JSON.stringify({sub:id,session_id:sid,app_metadata:{provider},amr:[{method}]})]);
 await db.exec('set role authenticated');
}
async function read(kind,q='',page=0){return (await db.query('select public.admin_catalog_read($1,$2,$3) d',[kind,q,page])).rows[0].d;}
async function write(kind,action,data={},id=null,version=null){return (await db.query('select public.admin_catalog_write($1,$2,$3,$4::jsonb,$5) d',[kind,action,id,JSON.stringify(data),version])).rows[0].d;}
try {
 await db.exec(await readFile('tests/fixtures/base.sql','utf8'));
 await db.exec(`alter table auth.users add column email text,add column raw_app_meta_data jsonb,add column last_sign_in_at timestamptz; create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id)); create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;`);
 for(const f of (await readdir('tests/fixtures')).filter(x=>x.endsWith('.sql')&&x!=='base.sql').sort()) await db.exec(await readFile('tests/fixtures/'+f,'utf8'));
 await db.exec(await readFile('supabase/admin.sql','utf8'));
 await db.exec(await readFile('supabase/observability.sql','utf8'));
 await db.exec(`update public.profiles set is_superadmin=true where id='${admin}';insert into auth.sessions values('${sid}','${admin}');`);
 for(const id of [null,member]) { await session(id);await assert.rejects(read('terms'),/superadmin/);await assert.rejects(write('terms','create',{term:'Blocked',definition:'Denied'}),/superadmin/); }
 await session(admin,'google','password'); await assert.rejects(read('terms'),/superadmin/);
 await session(admin);
 for(const kind of ['prompt_chains','prompt_chain_steps','prompt_chain_mix','terms','ai_generation_examples','llm_models','llm_providers','allowed_signup_domains','whitelisted_emails','generation_requests','llm_responses']) assert.ok(Array.isArray((await read(kind)).rows));
 await assert.rejects(read('profiles;drop table profiles'),/Unknown/);
 for(const kind of ['prompt_chains','prompt_chain_steps','generation_requests','llm_responses']) await assert.rejects(write(kind,'create',{}),/read.only/);
 await assert.rejects(write('prompt_chain_mix','create',{}),/update.only/);
 const fixtures={terms:{term:'Test term',definition:'Definition'},llm_providers:{name:'Test provider',api_base_url:'https://example.com'},allowed_signup_domains:{domain:'example.edu'},whitelisted_emails:{email:'tester@example.edu'},ai_generation_examples:{input:'Test input',output:'Test output',notes:''}};
 for(const [kind,data] of Object.entries(fixtures)) {
  const created=await write(kind,'create',data); assert.ok(created.id);
  assert.equal((await read(kind,created.id)).total,1);
  await assert.rejects(write(kind,'update',data,created.id,0),/another tab/);
  const updated=await write(kind,'update',data,created.id,created.version);assert.equal(updated.version,2);
  await assert.rejects(write(kind,'delete',{},created.id,created.version),/another tab/);
  await write(kind,'delete',{},created.id,updated.version);assert.equal((await read(kind,created.id)).total,0);
 }
 const provider=await write('llm_providers','create',{name:'Model provider',api_base_url:'https://example.com'});
 const model=await write('llm_models','create',{provider_id:provider.id,name:'Test model',model_id:'test-model',enabled:true});
 await assert.rejects(write('llm_providers','delete',{},provider.id,provider.version),/foreign key/);
 const changed=await write('llm_models','update',{provider_id:provider.id,name:'Renamed',model_id:'test-model',enabled:false},model.id,model.version);
 assert.equal(changed.enabled,false);await write('llm_models','delete',{},model.id,changed.version);await write('llm_providers','delete',{},provider.id,provider.version);
 await assert.rejects(write('terms','create',{term:'',definition:'x'}),/check constraint/);
 await assert.rejects(write('allowed_signup_domains','create',{domain:'https://example.edu'}),/check constraint/);
 await assert.rejects(write('whitelisted_emails','create',{email:'invalid'}),/check constraint/);
 await assert.rejects(write('terms','create',{term:'x',definition:'y',is_superadmin:true}),/Unknown field/);
 const mix=(await read('prompt_chain_mix')).rows[0];assert.ok(mix);
 await assert.rejects(write('prompt_chain_mix','update',{weight:-1,enabled:true},mix.id,mix.version),/check constraint/);
 const edited=await write('prompt_chain_mix','update',{weight:50,enabled:false},mix.id,mix.version);assert.equal(edited.weight,50);
 await assert.rejects(db.query('select * from public.terms'),/permission denied/);
 await db.exec('reset role');await db.exec(`delete from auth.sessions where id='${sid}'`);await session(admin);await assert.rejects(read('terms'),/superadmin/);
 console.log('PASS: all collections, CRUD, read-only and update-only boundaries, field allowlist, constraints, foreign keys, stale writes, private tables, Google/session/member authorization.');
} catch(e) {console.error(e);process.exitCode=1;} finally {await db.close();}
