# Week 6 admin panel

Independent Next.js application for LKRamen/COMS6998_admin; shared Supabase project swmgfanscadzfkqoctle. Original COMS6998 source is read-only reference. Keep all admin commits here.

1. Inspect existing profiles, moments, generation_runs, captions and caption_votes; preserve historical data.
2. Add protected is_superadmin field, bootstrap only Layth's existing Columbia Google account, and narrowly scoped admin RPCs with fresh database authorization. Require Google OAuth session, including at the database boundary. Ordinary users cannot elevate themselves.
3. Build responsive Quip Control interface: overview with real activity, style approval and leaderboards; searchable paginated profiles/media/votes; media generation/upload/create, detail/update/delete with explicit confirmation; immutable vote ledger. Show real empty states and errors.
4. Verify role denial, privilege escalation denial, authorized CRUD and optimistic concurrency. Run lint, types, production build and browser checks.
5. Commit to admin GitHub repo, create separate coms6998-admin Vercel project, configure secrets server-side, Google callback allow list, disable Vercel deployment protection while keeping app authorization. Verify anonymous access cannot expose admin data; provide immutable URLs for both apps.

Bootstrap resolves the assignment's initial lockout through trusted SQL access, not an exposed self-promotion flow. Profile management and ratings are read-only per rubric. Media edits preserve original generated text as provenance and save the visible caption separately; changing it rerenders the image. Deletion cascades linked captions/votes and records an admin audit event. No historical records are deleted during verification.

Previous-week feedback was not supplied in this request. Existing generation/presentation improvements are preserved; do not claim unverified rubric feedback completion.
