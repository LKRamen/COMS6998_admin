import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const admin='00000000-0000-4000-8000-000000000001',member='00000000-0000-4000-8000-000000000002';
const sid='99999999-0000-4000-8000-000000000001',mid='10000000-0000-4000-8000-000000000001';
async function session(id,provider='google',method='oauth'){
 await db.exec('reset role');
 await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[id??'',JSON.stringify({sub:id,session_id:sid,app_metadata:{provider},amr:[{method}]})]);
 await db.exec('set role authenticated');
}
async function rpc(action,data={}){return (await db.query('select public.admin_media($1,$2,$3::jsonb) result',[action,mid,JSON.stringify(data)])).rows[0].result;}
try{
 await db.exec(await readFile('tests/fixtures/base.sql','utf8'));
 await db.exec(`alter table auth.users add column email text,add column raw_app_meta_data jsonb,add column last_sign_in_at timestamptz;
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;`);
 for(const f of (await readdir('tests/fixtures')).filter(x=>x.endsWith('.sql')&&x!=='base.sql').sort()) await db.exec(await readFile('tests/fixtures/'+f,'utf8'));
 await db.exec(await readFile('supabase/admin.sql','utf8'));
 await db.exec(`update public.profiles set is_superadmin=true where id='${admin}';insert into auth.sessions values('${sid}','${admin}');`);
 await session(null);await assert.rejects(db.query('select public.admin_read()'),/superadmin/);
 await session(member);await assert.rejects(db.query('select public.admin_access()'),/superadmin/);
 await assert.rejects(db.query('update public.profiles set is_superadmin=true where id=$1',[member]),/trusted database/);
 await session(admin,'google','password');await assert.rejects(db.query('select public.admin_read()'),/superadmin/);
 await session(admin,'email','oauth');await assert.rejects(db.query('select public.admin_read()'),/superadmin/);
 await session(admin);
 assert.equal((await db.query('select public.admin_access() a')).rows[0].a,true);
 const payload={context:'Test context',style:'Funny',status:'published',photo_path:admin+'/admin-test.jpg',rendered_path:admin+'/render-test.jpg',captions:['First generated caption','Second caption','Third caption'],system_prompt:'Test provenance',user_prompt:'{}',model:'test',settings:{}};
 await rpc('create',payload);
 const all=(await db.query("select public.admin_read('media','',0,$1) d",[mid])).rows[0].d;
 assert.equal(all.total,1);assert.equal(all.rows[0].caption,'First generated caption');
 const before=all.rows[0];
 await assert.rejects(rpc('update',{...payload,caption:'Edited visible caption',updated_at:'2000-01-01'}),/another tab/);
 await rpc('update',{...payload,caption:'Edited visible caption',updated_at:before.updated_at});
 const changed=(await db.query("select public.admin_read('media','',0,$1) d",[mid])).rows[0].d.rows[0];
 assert.equal(changed.caption,'Edited visible caption');assert.equal(changed.generated_caption,'First generated caption');
 await session(member);await assert.rejects(rpc('delete',{updated_at:changed.updated_at}),/superadmin/);
 await session(admin);const overview=(await db.query('select public.admin_read() d')).rows[0].d;assert.equal(overview.published,1);assert.equal(overview.audit.length,2);
 await rpc('delete',{updated_at:changed.updated_at});
 assert.equal((await db.query("select public.admin_read('media','',0,$1) d",[mid])).rows[0].d.total,0);
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from public.captions where moment_id=$1',[mid])).rows[0].n,0);
 await db.exec(`delete from auth.sessions where id='${sid}'`);await session(admin);await assert.rejects(db.query('select public.admin_access()'),/superadmin/);
 console.log('PASS: guest/member/password/wrong-provider/revoked-session denial, self-promotion blocked, admin create/read/update/delete, stale write rejection, original provenance retained, audit and cascade deletion.');
}catch(error){console.error(error.message);process.exitCode=1;}finally{await db.close();}
