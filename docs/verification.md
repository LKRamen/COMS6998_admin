# Verification

Current status (2026-10-22): the exact admin callback is registered and a fresh Google login successfully opened Quip Control on the admin domain. See [week-6-rubric.md](week-6-rubric.md) for the current rubric checks, regression tests and live rollback verification. The earlier database counts below describe the initial implementation, not current totals.

## Verified

- Independent admin GitHub repo and Vercel project created; original application repository left unchanged.
- Additive migration applied with the scoped Supabase MCP. Existing 4 profiles, 94 media records and 58 votes preserved. All public tables retain RLS.
- Only the existing Columbia Google profile was bootstrapped as superadmin; ordinary profile edits cannot modify the flag.
- Four Vitest assertions cover Google-only claim validation, safe callback paths, and preservation of caption/context after a failed save. The failed-save regression was reproduced before fixing the React form-action reset.
- Disposable PGlite tests pass for guest/member/password/wrong-provider/revoked-session denial, blocked self-promotion, admin media CRUD, stale write rejection, provenance, audit and cascading deletion.
- ESLint and optimized Next.js production build pass. Private images intentionally use ordinary authenticated browser requests instead of Next image optimization.
- Deployed anonymous checks: all admin pages redirect to login; private image and mutation endpoints return 401; no admin data appears in responses; cache headers are private/no-store.
- Correct Vercel owner verified through API: lkr2124@columbia.edu; project in lkr2124-2742s-projects. Deployment protection disabled on the admin project; original app already has it disabled.

## Login resolved

The earlier Supabase dashboard save was interrupted by sign-out. On 2026-10-22, the saved URL list was checked directly and includes `https://coms6998-admin-phi.vercel.app/auth/callback`. A new Google OAuth flow returned to that callback and then the admin overview. Keep original consumer callbacks and Site URL intact.

The unsuffixed domain serves another application and must not be used. Start a fresh sign-in at the suffixed canonical admin domain rather than returning to an old OAuth tab. Browser login and live overview are verified. Media CRUD and permission boundaries have passed local and hosted rollback tests; a full browser upload/generation/edit/delete cycle is not claimed by those tests.

The user confirmed previous-week feedback is already implemented and requested that this work focus only on the admin page. Course submission has not been made.

Original app's latest observed immutable deployment: https://coms-6998-fifsrpz92-lkr2124-2742s-projects.vercel.app (36ef55ee9cb946ebfe13749f69a55f7919913bc3).
