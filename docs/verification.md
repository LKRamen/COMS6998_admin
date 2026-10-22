# Verification and remaining deployment step

## Verified

- Independent admin GitHub repo and Vercel project created; original application repository left unchanged.
- Additive migration applied with the scoped Supabase MCP. Existing 4 profiles, 94 media records and 58 votes preserved. All public tables retain RLS.
- Only the existing Columbia Google profile was bootstrapped as superadmin; ordinary profile edits cannot modify the flag.
- Four Vitest assertions cover Google-only claim validation, safe callback paths, and preservation of caption/context after a failed save. The failed-save regression was reproduced before fixing the React form-action reset.
- Disposable PGlite tests pass for guest/member/password/wrong-provider/revoked-session denial, blocked self-promotion, admin media CRUD, stale write rejection, provenance, audit and cascading deletion.
- ESLint and optimized Next.js production build pass. Private images intentionally use ordinary authenticated browser requests instead of Next image optimization.
- Deployed anonymous checks: all admin pages redirect to login; private image and mutation endpoints return 401; no admin data appears in responses; cache headers are private/no-store.
- Correct Vercel owner verified through API: lkr2124@columbia.edu; project in lkr2124-2742s-projects. Deployment protection disabled on the admin project; original app already has it disabled.

## Remaining

Supabase dashboard signed out during the corrected OAuth redirect save. The callback `https://coms6998-admin-phi.vercel.app/auth/callback` still needs to be saved and verified after dashboard sign-in. Remove only the mistakenly added `https://coms6998-admin.vercel.app/auth/callback`; preserve original app callbacks and Site URL.

The unsuffixed domain serves another application and must not be used. Actual Google login testing on the correct domain fell back to the original app, consistent with an unregistered callback. Do not claim successful authenticated browser CRUD until the correct callback is saved and a fresh Google login succeeds. Then inspect overview, users, media and ratings on desktop/mobile, and exercise media creation/update/delete using a disposable record.

Previous-week feedback was not supplied. Do not claim that specific unseen feedback was implemented. Course submission has not been made.

Original app's latest observed immutable deployment: https://coms-6998-fifsrpz92-lkr2124-2742s-projects.vercel.app (36ef55ee9cb946ebfe13749f69a55f7919913bc3).
