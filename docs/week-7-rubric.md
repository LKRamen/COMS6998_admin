# Week 7: Admin Panel with More Observability

Implementation date: October 29, 2026. Deployment and course submission must be verified separately; local implementation is not a submission.

| Requirement | Admin route | Behavior |
| --- | --- | --- |
| Read users | `/users` | Existing searchable profile directory |
| Read prompt chains | `/catalog/prompt_chains` | Registered source pipeline and version; links to steps |
| Read prompt chain steps | `/catalog/prompt_chain_steps` | Ordered steps and full system/user prompt inspection |
| Read/update prompt chain mix | `/catalog/prompt_chain_mix` | Weight 0–100 and enabled state; stale edits rejected |
| CRUD terms | `/catalog/terms` | Named terms and definitions |
| Read/view generated media | `/media` | Existing private previews and generation provenance |
| Read generation requests | `/catalog/generation_requests` | Status, failures, inputs, prompts, settings, run/media links |
| CRUD AI generation examples | `/catalog/ai_generation_examples` | Input, expected output, notes |
| CRUD LLM models | `/catalog/llm_models` | Provider relationship, display/API name, enabled state |
| CRUD LLM providers | `/catalog/llm_providers` | Name and HTTPS API base URL; referenced providers cannot be deleted |
| Read LLM responses | `/catalog/llm_responses` | Existing generation runs and their ordered saved captions |
| CRUD allowed signup domains | `/catalog/allowed_signup_domains` | Normalized unique domains |
| CRUD whitelisted emails | `/catalog/whitelisted_emails` | Normalized unique email addresses |
| CRUD/upload images | `/media`, `/media/new`, `/media/[id]` | Existing upload, image preview, edit, generation and deletion workflows |

Every new collection supports text/ID search, pagination, expanded record inspection and empty states. Forms preserve attempted input on failures, require explicit delete confirmation and report conflicts. Every read and mutation checks a current Google OAuth session and fresh superadmin membership both in the app and database. New tables have RLS enabled with no direct guest/member access; audited RPCs are the only application entry points.

## Configuration semantics

The source pipeline is a single Gemini call, not an existing multi-step orchestration system. The catalog includes a clearly labeled snapshot of its actual Brainrot-style template. Mix, models/providers, examples, terms and signup lists are persisted administration records. They do not silently change the consumer's source-defined generation or Google signup behavior. This assignment requests management operations, not a new generation engine or signup enforcement policy. Saved LLM responses are the actual caption outputs; the old pipeline did not preserve raw provider payloads.

## Verification

- 13 Vitest assertions passed, including form input preservation, explicit deletion payload, field validation, normalization and read-only boundaries.
- Original media/security PGlite suite passed.
- New catalog PGlite suite passed: every collection, all CRUD resources, mix edit, foreign keys, stale versions, validation, unknown fields/collections and Google/member/revoked-session denial.
- `tests/live-catalog-rollback.sql` passed on the scoped hosted project. All synthetic writes, deletes and audit entries were rolled back.
- Hosted table privilege inspection confirmed RLS on every new table, no anonymous reads and no direct authenticated inserts.
- Production Next.js build/typecheck and ESLint passed after restoring dependencies from the unchanged lockfile, using Node 24.19.0 for checks.
- Independent code review found no actionable correctness/security issue.
- Local preview startup was rejected by automatic approval review. New-screen desktop/mobile visual QA is not yet verified.

## Remaining release evidence

Vercel connector reports no teams; saved team requests fail 403 and consent recovery fails 404. Local CLI also cannot access the saved scope. The built-in browser was signed in to a different account and is now at Vercel login for the intended project. Restore access as `lkr2124@columbia.edu` before claiming deployment/protection checks.

Previous week's feedback was not supplied in this conversation. Last week's saved release notes state the user had already implemented that week's feedback; that is not evidence about newer feedback. Obtain the applicable feedback before claiming the 50-point feedback criterion.
