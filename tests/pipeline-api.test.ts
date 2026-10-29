import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), rpc: vi.fn(), serviceRpc: vi.fn(), service: vi.fn(),
  models: vi.fn(), normalize: vi.fn(), run: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("../lib/auth", () => ({
  adminSession: mocks.session,
  AccessError: class AccessError extends Error {
    constructor(public status: number, message: string) { super(message); }
  },
}));
vi.mock("../lib/supabase", () => ({ storageClient: mocks.service }));
vi.mock("../lib/pipeline-models", () => ({ pipelineModelOptions: mocks.models }));
vi.mock("../lib/caption-photo", () => ({ normalizePhoto: mocks.normalize }));
vi.mock("../lib/pipeline-runtime", () => ({ runPipeline: mocks.run }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { POST } from "../app/api/pipelines/route";
import { AccessError } from "../lib/auth";
import { GenerationError } from "../lib/generation-error";
const id = "00000000-0000-4000-8000-000000000001";
const testId = "00000000-0000-4000-8000-000000000002";
const releaseId = "00000000-0000-4000-8000-000000000003";
const data = { name: "Saved pipeline", description: "Fixture", style: "Brainrot", steps: [{ name: "Caption", model: "default", systemPrompt: "Use the image.", userPrompt: "Context: {{context}}" }] };
const draft = { ...data, id, version: 3 };
const savedTest = { id: testId, pipeline_id: id, draft_version: 3, status: "pending", snapshot: data };
const providerResult = { steps: [{ ...data.steps[0], model: "gemini-2.5-flash", output: "Real provider result" }], captions: ["One", "Two", "Three"] };

function request(fields: Record<string, string | Blob>, origin = "https://admin.example") {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new Request("https://admin.example/api/pipelines", { method: "POST", headers: { origin }, body: form });
}
const testRequest = (extra: Record<string, string | Blob> = {}) => request({ action: "test", id, version: "3", context: "An ordinary photo", photo: new File(["image"], "image.jpg", { type: "image/jpeg" }), ...extra });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ client: { rpc: mocks.rpc }, user: { id } });
  mocks.service.mockReturnValue({ rpc: mocks.serviceRpc });
  mocks.models.mockResolvedValue([{ value: "default", label: "Deployment default" }]);
  mocks.normalize.mockResolvedValue(Buffer.from("normalized image"));
  mocks.run.mockResolvedValue(providerResult);
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === "admin_pipeline_read") return { data: { rows: [draft] }, error: null };
    if (name === "admin_pipeline_save") return { data: draft, error: null };
    if (name === "admin_pipeline_start_test") return { data: savedTest, error: null };
    if (name === "admin_pipeline_publish") return { data: { id: releaseId }, error: null };
    return { data: {}, error: null };
  });
  mocks.serviceRpc.mockImplementation(async (_name: string, params: { p_status: string }) => ({ data: { ...savedTest, status: params.p_status, results: params.p_status === "succeeded" ? providerResult : null }, error: null }));
});

describe("pipeline API authorization and validation", () => {
  it("rejects unauthenticated callers before database, normalization or provider access", async () => {
    mocks.session.mockRejectedValue(new AccessError(401, "Sign in with Google."));
    const response = await POST(testRequest());
    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.normalize).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("rejects cross-origin and missing-origin writes", async () => {
    for (const origin of ["https://attacker.example", "", "null"]) {
      const response = await POST(request({ action: "save", data: JSON.stringify(data) }, origin));
      expect(response.status).toBe(403);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it("rejects malformed, oversized and unknown draft fields before persistence", async () => {
    for (const value of ["not json", JSON.stringify({ ...data, active_release: releaseId }), JSON.stringify({ ...data, name: "x".repeat(121) }), JSON.stringify({ ...data, steps: [{ ...data.steps[0], systemPrompt: "x".repeat(8001) }] })]) {
      expect((await POST(request({ action: "save", data: value }))).status).toBe(400);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects a safe-looking model that is not an enabled choice", async () => {
    const response = await POST(request({ action: "save", data: JSON.stringify({ ...data, steps: [{ ...data.steps[0], model: "gemini-not-enabled" }] }) }));
    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("persists only parsed fields and the submitted draft version", async () => {
    const response = await POST(request({ action: "save", id, version: "3", data: JSON.stringify({ ...data, name: "  Saved pipeline  " }) }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("admin_pipeline_save", { p_id: id, p_version: 3, p_data: data });
    expect(mocks.rpc).toHaveBeenCalledWith("admin_pipeline_read", { p_id: id });
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("bounds actual body bytes even without a content-length header", async () => {
    const response = await POST(new Request("https://admin.example/api/pipelines", { method: "POST", headers: { origin: "https://admin.example", "content-type": "application/x-www-form-urlencoded" }, body: "data=" + "x".repeat(6 * 1024 * 1024 + 1) }));
    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("pipeline test provenance", () => {
  it("has no browser-accessible finish or certify action", async () => {
    const response = await POST(request({ action: "finish", id, testId, results: JSON.stringify(providerResult), status: "succeeded" }));
    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.serviceRpc).not.toHaveBeenCalled();
  });
  it("tests the reserved saved snapshot and certifies only server-generated output", async () => {
    const response = await POST(testRequest({ results: JSON.stringify({ captions: ["Forged"] }), data: JSON.stringify({ ...data, steps: [] }), testId: releaseId }));
    expect(response.status).toBe(200);
    expect(mocks.run).toHaveBeenCalledWith({ steps: data.steps, image: Buffer.from("normalized image"), context: "An ordinary photo", style: data.style });
    expect(mocks.serviceRpc).toHaveBeenCalledWith("admin_pipeline_finish_test", { p_test_id: testId, p_status: "succeeded", p_results: providerResult, p_error: null });
    expect(mocks.rpc).not.toHaveBeenCalledWith("admin_pipeline_finish_test", expect.anything());
  });
  it("does not call the provider when rate reservation is rejected", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "admin_pipeline_read" ? { data: { rows: [draft] }, error: null } : { data: null, error: { code: "54000" } });
    const response = await POST(testRequest());
    expect(response.status).toBe(429);
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it("records provider failure without certifying forged or partial output", async () => {
    mocks.run.mockRejectedValue(new GenerationError("Provider unavailable."));
    const response = await POST(testRequest());
    expect(response.status).toBe(200);
    expect((await response.json()).test.status).toBe("failed");
    expect(mocks.serviceRpc).toHaveBeenCalledWith("admin_pipeline_finish_test", { p_test_id: testId, p_status: "failed", p_results: null, p_error: "Provider unavailable." });
  });
});

describe("pipeline publication concurrency", () => {
  it("passes the exact draft revision, successful-test identity and expected live release to the guarded RPC", async () => {
    const response = await POST(request({ action: "publish", id, version: "3", testId, expectedRelease: releaseId, results: JSON.stringify(providerResult) }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("admin_pipeline_publish", { p_id: id, p_version: 3, p_test_id: testId, p_expected_release: releaseId });
    expect(mocks.serviceRpc).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("returns a conflict when the draft or live release has changed", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "40001" } });
    const response = await POST(request({ action: "publish", id, version: "3", testId, expectedRelease: releaseId }));
    expect(response.status).toBe(409);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("requires the expected live release to restore built-in prompts", async () => {
    expect((await POST(request({ action: "unpublish", style: "Brainrot" }))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
    const response = await POST(request({ action: "unpublish", style: "Brainrot", expectedRelease: releaseId }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("admin_pipeline_unpublish", { p_style: "Brainrot", p_expected_release: releaseId });
  });
});
