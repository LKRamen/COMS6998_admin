# Repository instructions

- The product is named **Quip**. Use **Quip Control** for the admin app. `brainrot_*` database RPC names, historical prompt versions, and the Brainrot humor style are existing data conventions, not the current product name.
- This is the independent `LKRamen/COMS6998_admin` Git repository. The original app at `C:/Users/lkrah/COMS6998` is reference context; do not commit admin changes there.
- For Supabase work, use the locally configured Codex MCP server `supabase-coms6998`, scoped to project `swmgfanscadzfkqoctle`. Do not use a generic or differently scoped Supabase connector. If unavailable, report the blocker rather than switching connectors.
- The Vercel project is `coms6998-admin` in `lkr2124-2742s-projects`, owned by `lkr2124@columbia.edu`. Its assigned stable domain is `https://coms6998-admin-phi.vercel.app`. The unsuffixed domain belongs to a different app.
- Every admin data operation must require Google OAuth and a fresh database superadmin check. Do not weaken authorization to make tests or login pass.
- Read the relevant installed guide in `node_modules/next/dist/docs/` before changing Next.js code. This project uses Next.js 16.3.8; do not assume older conventions.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
