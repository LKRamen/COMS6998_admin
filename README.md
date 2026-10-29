# Quip Control — COMS6998 Week 7

Independent admin app for the existing Quip Supabase database. This repository is deployed to its own Vercel project, `coms6998-admin`; it does not change the COMS6998 app repository.

## Features

- Week 7 observability and configuration collections: prompt chains/steps/mix, generation requests and saved LLM responses; CRUD terms, examples, models, providers, signup domains and email whitelist. See [the Week 7 rubric and verification](docs/week-7-rubric.md) for routes and configuration semantics. The additive `supabase/observability.sql` migration has been applied; do not rerun it.

- Dashboard with real totals, 14-day media/vote activity, approval rates, unrated publications, style performance, top media, and admin audit activity.
- Searchable, paginated, read-only user/profile directory and upvote/downvote ledger.
- Media CRUD: upload an image, generate three Gemini captions, create a draft or publication, inspect original generation provenance, edit context/style/visible caption/visibility, rerender, and delete with explicit confirmation. Stale edits/deletions are rejected.
- Responsive desktop/mobile interface with loading, error and empty states.

## Security and the initial lockout

Google OAuth is the only login offered. Protected layouts, every data function, API endpoints, and database admin RPCs require authorization. The database verifies a Google OAuth claim, a live Auth session, and a fresh `profiles.is_superadmin = true` lookup. A linked Google identity alone does not qualify a password login. Sessions and private images are never publicly cached.

The initial admin was bootstrapped through trusted SQL access for the existing `lkr2124@columbia.edu` Google account. There is no public promotion endpoint. A trigger rejects ordinary users attempting to change `is_superadmin`, even through a direct Data API request. Existing RLS policies remain unchanged. The service key stays server-only and is used to access private Storage after admin authorization.

`supabase/admin.sql` is the applied additive migration. Use only the repository's `supabase-coms6998` MCP server, scoped to `swmgfanscadzfkqoctle`, for database administration. Do not rerun the whole migration on an already migrated project; it intentionally creates named objects once.

To grant another admin, first verify the intended Google identity, then update its profile through trusted SQL access. Never expose this through editable profile fields.

## Development

Use Node.js 24, `npm ci`, and copy `.env.example` to `.env.local` with the existing project credentials. Run `npm run dev`. Set `APP_ORIGIN` to the origin registered in Supabase's OAuth redirect allow list. Google login from immutable Vercel URLs starts on the stable registered admin origin so PKCE cookies remain on the correct host.

```
npm test
npm run test:database
npm run lint
npm run build
```

The database test creates a disposable PGlite database using snapshots of the original application's migrations, then checks privilege escalation denial, guest/member/password/provider/session boundaries, media CRUD, concurrency, audit, and provenance. It never contacts production.

## Deployment

Deploy only this repository to `coms6998-admin`, using the six variables in `.env.example`. Keep `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` private. Add the stable admin `/auth/callback` to Supabase's redirect allow list without replacing the original app's Site URL. Vercel deployment protection is disabled for incognito access; the application login and database authorization stay enforced.

The assignment requires commit-specific URLs for both the original media/rating app and this admin app. Previous-week feedback was not supplied, so no claim is made that specific unseen feedback was implemented.
