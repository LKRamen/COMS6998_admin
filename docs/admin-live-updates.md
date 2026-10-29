# Admin live updates

Supabase Realtime replicates only `admin_live_signal`, a single change counter. Statement triggers cover media, captions, votes, generation requests/results, profiles, pipeline drafts/tests/releases and admin catalogs. Existing private tables are not added to the publication.

Authenticated reads require the existing fresh Google OAuth, superadmin and active-session check through RLS. Browsers have SELECT only; triggers update the counter. Actual data continues through guarded server reads.

Dashboard, community, votes and generation-observability pages automatically refresh after a 750ms coalescing window. Library and pipeline list offer Show updates to avoid moving cards. Editing pages display a notice without refreshing forms. Current URL filters and browser scroll survive route refreshes. Hidden tabs defer refreshes; reconnect, visibility changes and a visible-tab 60-second reconciliation check recover missed signals. Subscriptions and timers are removed on unmount.

Apply `supabase/admin-realtime.sql` once before deploying the UI. Verify `admin_live_signal` is present in `supabase_realtime`. A safe delivery smoke test can increment the signal counter without changing any user record. Do not publish a pipeline or change votes just to test delivery.

Tests: `tests/database.mjs` covers signal authorization, write denial and trigger delivery; `tests/live-updates.test.tsx` covers batching, library review, editing protection, reconnection, visibility and cleanup.
