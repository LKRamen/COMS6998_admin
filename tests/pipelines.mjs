import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const admin = '00000000-0000-4000-8000-000000000001';
const member = '00000000-0000-4000-8000-000000000002';
const sid = '99999999-0000-4000-8000-000000000001';
const sample = { name: 'Pipeline test', description: 'Database test fixture', style: 'Brainrot', steps: [{ name: 'Write captions', model: 'default', systemPrompt: 'Write three grounded captions.', userPrompt: 'Use the supplied image and {{context}}.' }] };
async function session(id, provider = 'google', method = 'oauth') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [id ?? '', JSON.stringify({ sub: id, session_id: sid, app_metadata: { provider }, amr: [{ method }] })]);
  await db.exec('set role authenticated');
}
async function rpc(name, values, casts = []) {
  const placeholders = values.map((_, i) => `$${i + 1}${casts[i] ? '::' + casts[i] : ''}`).join(',');
  return (await db.query(`select public.${name}(${placeholders}) result`, values)).rows[0].result;
}
const save = (data = sample, id = null, version = null) => rpc('admin_pipeline_save', [id, version, JSON.stringify(data)], ['uuid', 'integer', 'jsonb']);
const start = draft => rpc('admin_pipeline_start_test', [draft.id, draft.version]);
const publish = (draft, test, expected = null) => rpc('admin_pipeline_publish', [draft.id, draft.version, test.id, expected]);
const results = draft => ({ steps: draft.steps.map(s => ({ ...s, model: s.model === 'default' ? 'gemini-2.5-flash' : s.model, output: 'Three valid captions' })), captions: ['Caption one', 'Caption two', 'Caption three'] });
async function finish(test, data, status = 'succeeded') {
  await db.exec('reset role; set role service_role');
  const result = await rpc('admin_pipeline_finish_test', [test.id, status, JSON.stringify(data), status === 'failed' ? 'Provider unavailable.' : null], ['uuid', 'text', 'jsonb', 'text']);
  await session(admin);
  return result;
}
try {
  await db.exec(await readFile('tests/fixtures/base.sql', 'utf8'));
  await db.exec(`alter table auth.users add column email text,add column raw_app_meta_data jsonb,add column last_sign_in_at timestamptz;
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;`);
  for (const f of (await readdir('tests/fixtures')).filter(x => x.endsWith('.sql') && x !== 'base.sql').sort()) await db.exec(await readFile('tests/fixtures/' + f, 'utf8'));
  for (const file of ['supabase/admin.sql', 'supabase/observability.sql', 'supabase/pipelines.sql']) await db.exec(await readFile(file, 'utf8'));
  await db.exec(`update public.profiles set is_superadmin=true where id='${admin}'; insert into auth.sessions values('${sid}','${admin}');`);
  for (const actor of [null, member]) {
    await session(actor);
    await assert.rejects(save(), /superadmin/);
    await assert.rejects(rpc('admin_pipeline_read', [null]), /superadmin/);
    await assert.rejects(rpc('admin_pipeline_unpublish', ['Brainrot', null]), /superadmin/);
  }
  await session(admin, 'google', 'password');
  await assert.rejects(save(), /superadmin/);
  await session(admin);
  for (const bad of [
    { ...sample, is_superadmin: true },
    { ...sample, steps: [] },
    { ...sample, steps: Array(4).fill(sample.steps[0]) },
    { ...sample, steps: [{ ...sample.steps[0], model: 'https://evil.example' }] },
    { ...sample, steps: [{ ...sample.steps[0], userPrompt: '' }] },
    { ...sample, style: 'Unknown' },
    { ...sample, name: '' },
  ]) await assert.rejects(save(bad));
  let draft = await save();
  assert.equal(draft.version, 1);
  assert.equal((await rpc('admin_pipeline_read', [draft.id])).rows[0].id, draft.id);
  await assert.rejects(save(sample, draft.id, 0), /another tab/);
  await assert.rejects(publish(draft, { id: '00000000-0000-4000-8000-000000000000' }), /successful test/);
  const test = await start(draft);
  assert.equal(test.snapshot.steps[0].model, 'default');
  assert.equal(test.session_id, undefined);
  await assert.rejects(start(draft), /already running/);
  await assert.rejects(rpc('admin_pipeline_finish_test', [test.id, 'succeeded', JSON.stringify(results(draft)), null], ['uuid', 'text', 'jsonb', 'text']), /permission denied/);
  await db.exec('reset role; set role service_role');
  await assert.rejects(rpc('admin_pipeline_finish_test', [test.id, 'succeeded', JSON.stringify({ ...results(draft), captions: ['Same', 'same', 'other'] }), null], ['uuid', 'text', 'jsonb', 'text']), /distinct/);
  await session(admin);
  await finish(test, results(draft));
  let release = await publish(draft, test);
  assert.equal(release.steps[0].model, 'gemini-2.5-flash');
  let read = await rpc('admin_pipeline_read', [draft.id]);
  assert.equal(read.rows[0].active_release.id, release.id);
  assert.equal(read.rows[0].latest_test.status, 'succeeded');
  assert.equal(read.active[0].release_id, release.id);
  await assert.rejects(publish(draft, test), /live pipeline changed/);
  draft = await save({ ...sample, name: 'Edited draft', steps: [{ ...sample.steps[0], systemPrompt: 'Different instructions.' }] }, draft.id, draft.version);
  read = await rpc('admin_pipeline_read', [draft.id]);
  assert.equal(read.rows[0].active_release.steps[0].systemPrompt, sample.steps[0].systemPrompt);
  await assert.rejects(publish(draft, test, release.id), /successful test/);
  const test2 = await start(draft);
  await finish(test2, results(draft));
  const release2 = await publish(draft, test2, release.id);
  assert.notEqual(release2.id, release.id);
  await assert.rejects(rpc('admin_pipeline_unpublish', ['Brainrot', release.id]), /live pipeline changed/);
  await rpc('admin_pipeline_unpublish', ['Brainrot', release2.id]);
  assert.equal((await rpc('admin_pipeline_read', [draft.id])).active.length, 0);
  await assert.rejects(db.query('select * from public.pipeline_drafts'), /permission denied/);
  await assert.rejects(db.query('select * from public.pipeline_releases'), /permission denied/);
  await db.exec('reset role; set role service_role');
  assert.equal((await db.query('select count(*) count from public.pipeline_releases')).rows[0].count, 2);
  await assert.rejects(db.query('select * from public.pipeline_tests'), /permission denied/);
  await assert.rejects(db.query('update public.pipeline_releases set name=\'Changed\''), /permission denied/);
  await db.exec('reset role');
  await assert.rejects(db.query('update public.pipeline_releases set name=\'Changed\''), /immutable/);
  await assert.rejects(db.query('delete from public.pipeline_releases'), /immutable/);

  // Revocation during a provider call must prevent the server from certifying it.
  await session(admin);
  const revoked = await start(draft);
  await db.exec('reset role');
  await db.exec(`delete from auth.sessions where id='${sid}'`);
  await db.exec('set role service_role');
  await assert.rejects(rpc('admin_pipeline_finish_test', [revoked.id, 'succeeded', JSON.stringify(results(draft)), null], ['uuid', 'text', 'jsonb', 'text']), /active superadmin/);
  await db.exec('reset role');
  await db.exec(`insert into auth.sessions values('${sid}','${admin}'); update public.pipeline_tests set lease_expires_at=now()-interval '1 second' where id='${revoked.id}';`);
  await session(admin);
  const afterExpiry = await start(draft);
  await finish(afterExpiry, null, 'failed');
  await assert.rejects(publish(draft, afterExpiry), /successful test/);
  // Ten total tests in the preceding hour, including failures, is the limit.
  for (let i = 4; i < 10; i++) { const t = await start(draft); await finish(t, null, 'failed'); }
  await assert.rejects(start(draft), /10 pipeline tests/);
  await db.exec('reset role');
  assert.equal((await db.query("select count(*) count from private.catalog_audit where collection='pipeline_releases'")).rows[0].count, 3);
  await db.exec(`update public.profiles set username_claimed=true,username='pipelineadmin',display_name='Pipeline admin' where id='${admin}'`);
  const moment = (await db.query("insert into public.moments(creator_id,photo_path,context,style) values($1,$2,'A test image','Brainrot') returning *", [admin, `${admin}/pipeline-test.jpg`])).rows[0];
  const requestKey = '12345678-0000-4000-8000-000000000001';
  const userPrompt = JSON.stringify({ context: moment.context, style: moment.style, photoRevision: moment.photo_revision, previousCaptions: [] });
  const requestSettings = { pipeline: { id: release2.id, steps: release2.steps } };
  await db.exec('set role service_role');
  const reservation = await rpc('caption_reserve', [admin, moment.id, requestKey, 'Pipeline system', userPrompt, 'gemini-2.5-flash', JSON.stringify(requestSettings)], ['uuid', 'uuid', 'uuid', 'text', 'text', 'text', 'jsonb']);
  await db.query("update public.generation_requests set settings=settings || $1::jsonb where id=$2", [JSON.stringify({ pipelineTrace: [{ output: 'Captured output' }] }), reservation.id]);
  const replay = await rpc('caption_reserve', [admin, moment.id, requestKey, 'Pipeline system', userPrompt, 'gemini-2.5-flash', JSON.stringify(requestSettings)], ['uuid', 'uuid', 'uuid', 'text', 'text', 'text', 'jsonb']);
  assert.equal(replay.id, reservation.id);
  assert.equal(replay.reused, true);
  await assert.rejects(rpc('caption_reserve', [admin, moment.id, requestKey, 'Pipeline system', userPrompt, 'gemini-2.5-flash', JSON.stringify({ pipeline: { id: release.id, steps: release.steps } })], ['uuid', 'uuid', 'uuid', 'text', 'text', 'text', 'jsonb']), /different inputs/);
  const runId = await rpc('caption_finish', [admin, reservation.id, JSON.stringify(['One', 'Two', 'Three'])], ['uuid', 'uuid', 'jsonb']);
  assert.equal((await db.query('select prompt_version from public.generation_runs where id=$1', [runId])).rows[0].prompt_version, `pipeline:${release2.id}`);
  const baselineReservation = await rpc('caption_reserve', [admin, moment.id, '12345678-0000-4000-8000-000000000002', 'Built-in system', userPrompt, 'gemini-2.5-flash', '{}'], ['uuid', 'uuid', 'uuid', 'text', 'text', 'text', 'jsonb']);
  const baselineRun = await rpc('caption_finish', [admin, baselineReservation.id, JSON.stringify(['Four', 'Five', 'Six'])], ['uuid', 'uuid', 'jsonb']);
  assert.equal((await db.query('select prompt_version from public.generation_runs where id=$1', [baselineRun])).rows[0].prompt_version, 'brainrot-v3');
  await session(admin);
  for (const [i, settings] of [{}, { pipeline: { id: release2.id } }, { pipeline: { id: 'invalid-reference' } }].entries()) {
    const mediaId = `12345678-0000-4000-8000-00000000000${i + 3}`;
    await rpc('admin_media', ['create', mediaId, JSON.stringify({ captions: ['Alpha', 'Beta', 'Gamma'], status: 'draft', photo_path: `${admin}/pipeline-admin-${i}.jpg`, rendered_path: `${admin}/pipeline-admin-render-${i}.jpg`, context: '', style: 'Brainrot', system_prompt: 'System', user_prompt: 'User', model: 'gemini-2.5-flash', settings })], ['text', 'uuid', 'jsonb']);
    await db.exec('reset role');
    assert.equal((await db.query('select prompt_version from public.generation_runs where moment_id=$1', [mediaId])).rows[0].prompt_version, i === 1 ? `pipeline:${release2.id}` : 'brainrot-v3');
    await session(admin);
  }
  console.log('PASS: pipeline draft validation, Google superadmin/session checks, tested publication, optimistic locks, immutable snapshots, model freezing, activation CAS, fallback, test rate limits and service-role boundaries.');
} catch (e) { console.error(e); process.exitCode = 1; }
finally { await db.close(); }
