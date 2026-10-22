# Week 6 admin readiness — 2026-10-22

Independent repository: LKRamen/COMS6998_admin. Admin app: https://coms6998-admin-phi.vercel.app. Consumer app remains a separate project.

| Requirement | Implementation and evidence |
| --- | --- |
| Interesting statistics | Live database overview: profile/media/vote totals, approval rate, 14-day activity, unrated-media percentage, style approval and leaderboard. |
| READ profiles | Searchable, paginated Community directory via guarded `admin_read('users')`. |
| CREATE media | Photo upload, Gemini caption generation and rendered media via guarded `/api/media` and `admin_media('create')`. |
| READ media | Searchable library, owner/author metadata, private authenticated images and media detail/provenance. |
| UPDATE media | Caption/context/style/status editing; original generation is retained; edited caption is rendered; stale updates are rejected. |
| DELETE media | Explicit DELETE confirmation, stale-write guard, database cascade and private Storage cleanup. |
| READ ratings | Searchable, paginated vote ledger with caption, voter, direction and timestamps. |
| Google login and database admin flag | Each page/data operation requires verified Google OAuth and a fresh `profiles.is_superadmin`/active-session check. Ordinary users cannot self-promote. |
| Initial admin access | Existing Columbia Google account bootstrapped through trusted scoped SQL; no public elevation endpoint. |
| Incognito access | Login page is publicly reachable; protected pages redirect to app login; API data/mutations reject anonymous requests. Vercel deployment protection must stay off, with application authorization intact. |

## Login verification

On 2026-10-22 the Supabase URL Configuration page showed the exact callback `https://coms6998-admin-phi.vercel.app/auth/callback`. A fresh Continue with Google using the existing Columbia account returned to the admin root, not `/feed` on the consumer app. The dashboard displayed 5 profiles, 94 media and 61 reactions at that check. These are point-in-time counts.

The prior failed attempt used an older login flow before the correct callback was registered. Keep the consumer Site URL and original callbacks; start a new login from the admin login page. Preview URLs intentionally redirect to the canonical admin login before starting PKCE so callback and verifier cookies share a host.

## Verification

- 7 unit/component assertions pass, including new canonical admin routing and fail-closed configuration regressions.
- PGlite authorization/CRUD/provenance/cascade tests pass.
- Live rollback-only checks pass through `supabase-coms6998`: authorized profile/vote reads and media create/read/update/delete, original generation retained, stale writes rejected, guest/member access denied and self-promotion blocked. No test photo was uploaded and no test row/audit entry was retained.
- ESLint and optimized Next build/typecheck pass. Independent source review found no missing rubric operation or release blocker.
- Quip charcoal/blue/mint styling is applied to the dashboard, tables, editors and login without changing authorization.

The user confirms prior-week feedback is already implemented and asked to focus only on the admin app. This run does not claim to independently grade that earlier work. Course submission remains a user action.
