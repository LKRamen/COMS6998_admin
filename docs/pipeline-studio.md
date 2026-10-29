# Pipeline studio

Pipeline studio adds a draft → image test → review → publish workflow at `/pipelines`.
The user approved publication per existing caption style. At most one custom release
is active for each style. Styles without a release retain the built-in prompts.

## Editing and testing

- Name the pipeline, choose a caption style, and define 1–3 ordered steps.
- Each step receives the image. Intermediate steps return text; the final step returns
  exactly three distinct captions of 1–240 characters.
- `{{context}}`, `{{style}}`, and `{{previous_output}}` are substituted once. User input
  is not recursively interpreted as template syntax. The input envelope is also sent
  as JSON to every step. Model instructions tell the model to treat that data as data.
- Use the deployment default Gemini model or an enabled Gemini identifier from the
  model catalog. Requests always use Google's fixed API endpoint and the server's
  Gemini credentials; catalog URLs never receive credentials.
- Save before testing. A test uploads a JPEG, PNG or WebP into request memory only;
  it does not create or publish a media item. Normalization strips image metadata.
- Tests retain prompts, model identifiers, step outputs and final captions. Tests
  are limited to one concurrent request and ten per hour per administrator.

## Publication and execution

Only a successful server-certified test of the current saved draft can be published.
The publication review names the caption style and the release being replaced.
The release freezes step order, prompt templates and actual tested model identifiers.
Future edits remain in the draft until another successful test and publication.

The consumer app resolves the active release at reservation time and stores its
snapshot with the generation request. In-flight generations do not change when
another administrator publishes. Exact executed prompts and outputs are recorded
under `settings.pipelineTrace`; existing observability views expose this field.
Admin media creation uses the same published-release lookup and execution engine.
Both generation paths label custom runs with `pipeline:<release-id>` as their prompt
version instead of the built-in template version.
Reused request keys keep the original release. Trace metadata is excluded from
idempotency comparisons. Errors fail the generation rather than silently swapping
to another pipeline. Restoring built-in prompts affects future reservations only.

## Rollout

1. Apply `supabase/pipelines.sql` after the existing admin and observability SQL.
   The migration creates no draft, release, or active selection.
2. Deploy the consumer's published-pipeline execution support.
3. Deploy the admin editor and test API. No custom pipeline runs until an
   administrator explicitly publishes one after a successful test.

This is independent of course assignment submission. Do not resubmit coursework
without the user's explicit consent.

## Verification

`tests/pipelines.mjs` exercises authorization, concurrency, revision locks, test
certification, immutable releases, activation conflicts and trace-safe retries in
isolated Postgres. Runtime tests mock the provider to verify ordered execution,
template substitution, fixed endpoints, image handoff and safe errors. Consumer
tests verify fallback, snapshots and saved execution traces. UI tests check save,
test and publication gates. A live provider test is still required for any draft
before the product allows publication.
