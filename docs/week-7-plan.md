# Week 7 implementation plan

Goal: extend Quip Control to cover the assignment's observability and administrative CRUD requirements, retaining Google OAuth and a fresh database superadmin check on every operation.

The assignment is the feature specification. Existing users and media screens remain in use, including image upload, previews, edits and deletion. Add searchable, paginated collections for prompt chains, ordered steps, editable mix, terms, generation requests, saved LLM responses, examples, models, providers, signup domains and email whitelist. Use real generation records; never fabricate history. New configuration tables start empty except an explicitly identified snapshot of the current source-defined chain. Configuration management does not silently change the consumer generation or authentication pipeline.

- [ ] Add isolated database tests for CRUD, read-only boundaries, stale writes, validation and unauthorized access.
- [ ] Add normalized tables with constraints and guarded, allowlisted RPCs; preserve existing records and policies.
- [ ] Add collection metadata, server reads, validated mutation API, accessible forms and navigation matching the existing theme.
- [ ] Run regression tests, lint and production build; verify live database within rollback transactions and browser screens where access permits.
- [ ] Commit only this independent admin repository's task changes. Deploy to the existing admin project, disable Vercel deployment protection for both apps, verify immutable URLs without Vercel cookies, and prepare submission evidence.

Release constraints: Vercel currently rejects the saved team through both connector and CLI; authorization recovery returns team not found. Resolve account access before deployment. Previous-week feedback is not present in this conversation; the prior release notes record that the user had already handled that week's feedback. Do not represent that as verification of this week's feedback.
