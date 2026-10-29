import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { adminSession, AccessError } from "../../../lib/auth";
import { isSameOriginRequest } from "../../../lib/request-origin";
import { storageClient } from "../../../lib/supabase";
import { isUuid, parseInputs } from "../../../lib/caption-input";
import { normalizePhoto } from "../../../lib/caption-photo";
import { parsePipeline, type PipelineTest } from "../../../lib/pipelines";
import { pipelineModelOptions } from "../../../lib/pipeline-models";
import { runPipeline } from "../../../lib/pipeline-runtime";
import { GenerationError } from "../../../lib/generation-error";

export const maxDuration = 120;
class InputError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
function uuid(value: FormDataEntryValue | null, optional = false) {
  if (optional && !value) return null;
  if (!isUuid(value)) throw new InputError("Choose a saved pipeline or release.");
  return value;
}
function version(form: FormData) {
  const value = Number(form.get("version"));
  if (!Number.isSafeInteger(value) || value < 1) throw new InputError("Save the draft before continuing.");
  return value;
}
function rpcError(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === "40001") throw new InputError("This draft or published style changed in another tab. Reload before continuing.", 409);
  if (error.code === "54000") throw new InputError("You have reached ten pipeline tests this hour. Try again later.", 429);
  if (error.code === "55000") throw new InputError("A pipeline test is already running. Wait for it to finish, then try again.", 409);
  if (error.code === "42501") throw new AccessError(403, "Current superadmin access is required.");
  throw new InputError("This action could not be completed. Save and test the latest draft, or wait for a running test to finish, then try again.");
}
async function boundedForm(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new InputError("Choose a pipeline action.");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 6 * 1024 * 1024) { await reader.cancel(); throw new InputError("Keep the photo under 5 MiB and prompts within their limits."); }
    chunks.push(value);
  }
  try { return await new Response(Buffer.concat(chunks), { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData(); }
  catch { throw new InputError("The form could not be read. Reload and try again."); }
}
export async function POST(request: Request) {
  try {
    const { client } = await adminSession();
    if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    const form = await boundedForm(request), action = form.get("action");
    if (action === "save") {
      let draft;
      try { draft = parsePipeline(JSON.parse(String(form.get("data")))); } catch (error) { throw new InputError(error instanceof SyntaxError ? "The draft could not be read." : error instanceof Error ? error.message : "Check the draft."); }
      const models = await pipelineModelOptions(client);
      if (draft.steps.some(step => !models.some(model => model.value === step.model))) throw new InputError("Choose an enabled Gemini model from the list.");
      const id = uuid(form.get("id"), true);
      const saved = await client.rpc("admin_pipeline_save", { p_id: id, p_version: id ? version(form) : null, p_data: draft }); rpcError(saved.error);
      const fresh = await client.rpc("admin_pipeline_read", { p_id: saved.data.id }); rpcError(fresh.error);
      revalidatePath("/pipelines");
      return NextResponse.json({ draft: fresh.data.rows[0] });
    }
    if (action === "test") {
      const id = uuid(form.get("id")), revision = version(form), photo = form.get("photo");
      if (!(photo instanceof File)) throw new InputError("Choose an image for this test.");
      let image;
      try { image = await normalizePhoto(photo); } catch (error) { throw new InputError(error instanceof Error ? error.message : "Check the photo."); }
      const loaded = await client.rpc("admin_pipeline_read", { p_id: id }); rpcError(loaded.error);
      const draft = loaded.data.rows[0];
      if (!draft || draft.version !== revision) throw new InputError("Save or reload the current draft before testing.");
      let context: string;
      try { context = parseInputs({ context: form.get("context"), style: draft.style }).context; } catch (error) { throw new InputError((error as Error).message); }
      const models = await pipelineModelOptions(client);
      if (draft.steps.some((step: { model: string }) => !models.some(model => model.value === step.model))) throw new InputError("A selected model is no longer enabled. Choose a model and save again.");
      const started = await client.rpc("admin_pipeline_start_test", { p_id: id, p_version: revision }); rpcError(started.error);
      const test = started.data as PipelineTest;
      // Only server-held credentials can certify test output; clients cannot forge a successful test.
      const service = storageClient();
      try {
        const results = await runPipeline({ steps: test.snapshot.steps, image, context, style: test.snapshot.style });
        const finished = await service.rpc("admin_pipeline_finish_test", { p_test_id: test.id, p_status: "succeeded", p_results: results, p_error: null });
        rpcError(finished.error);
        revalidatePath(`/pipelines/${id}`);
        return NextResponse.json({ test: finished.data });
      } catch (error) {
        const message = error instanceof GenerationError ? error.message : "The test could not be completed. Try again; the draft is still saved.";
        const finished = await service.rpc("admin_pipeline_finish_test", { p_test_id: test.id, p_status: "failed", p_results: null, p_error: message });
        if (finished.error) throw new InputError("The test could not be saved. Wait a few minutes, then test again before publishing.");
        return NextResponse.json({ test: finished.data });
      }
    }
    if (action === "publish") {
      const published = await client.rpc("admin_pipeline_publish", { p_id: uuid(form.get("id")), p_version: version(form), p_test_id: uuid(form.get("testId")), p_expected_release: uuid(form.get("expectedRelease"), true) });
      rpcError(published.error); revalidatePath("/pipelines");
      return NextResponse.json({ release: published.data });
    }
    if (action === "unpublish") {
      const result = await client.rpc("admin_pipeline_unpublish", { p_style: form.get("style"), p_expected_release: uuid(form.get("expectedRelease")) });
      rpcError(result.error); revalidatePath("/pipelines");
      return NextResponse.json({ ok: true });
    }
    throw new InputError("Choose a pipeline action.");
  } catch (error) {
    return NextResponse.json({ error: error instanceof AccessError || error instanceof InputError ? error.message : "The pipeline action could not be completed. Your draft is safe; try again." }, { status: error instanceof AccessError || error instanceof InputError ? error.status : 500 });
  }
}
