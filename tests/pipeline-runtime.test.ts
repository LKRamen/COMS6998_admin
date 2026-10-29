import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { parsePipeline, expandPrompt } from "../lib/pipelines";
import { runPipeline } from "../lib/pipeline-runtime";
const step = { name: "Caption", model: "default", systemPrompt: "Use the image", userPrompt: "Style {{style}}; {{context}}; {{previous_output}}" };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("rejects unsupported models, empty steps and unknown placeholders", () => {
  const draft = { name: "Test", description: "", style: "Brainrot", steps: [step] };
  expect(parsePipeline(draft).steps).toHaveLength(1);
  expect(() => parsePipeline({ ...draft, steps: [] })).toThrow();
  expect(() => parsePipeline({ ...draft, steps: [{ ...step, model: "https://evil.test" }] })).toThrow();
  expect(() => parsePipeline({ ...draft, steps: [{ ...step, userPrompt: "{{secret}}" }] })).toThrow(/placeholder/);
});
it("expands only template placeholders, without recursively interpreting supplied context", () => {
  expect(expandPrompt("{{context}} / {{previous_output}}", { context: "{{style}}", style: "Brainrot", previous_output: "a" })).toBe("{{style}} / a");
});
it("runs steps in order, passes intermediate output, and records actual model and prompts", async () => {
  vi.stubEnv("GEMINI_API_KEY", "test-key"); vi.stubEnv("GEMINI_MODEL", "gemini-test");
  const response = (output: string) => ({ ok: true, json: async () => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: output }] } }] }) });
  const fetcher = vi.fn().mockResolvedValueOnce(response("A cat on a laptop")).mockResolvedValueOnce(response(JSON.stringify({ captions: ["One", "Two", "Three"] })));
  vi.stubGlobal("fetch", fetcher);
  const result = await runPipeline({ steps: [{ ...step, name: "Describe" }, step], image: Buffer.from("photo"), context: "Study", style: "Brainrot" });
  expect(result.captions).toEqual(["One", "Two", "Three"]);
  expect(result.steps[1].userPrompt).toContain("A cat on a laptop");
  expect(result.steps[0].model).toBe("gemini-test");
  const body = JSON.parse(fetcher.mock.calls[1][1].body);
  expect(body.contents[0].parts[1].inlineData.data).toBe(Buffer.from("photo").toString("base64"));
  expect(fetcher.mock.calls[1][0]).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent");
});
it("stops on a provider failure without exposing provider response or running later steps", async () => {
  vi.stubEnv("GEMINI_API_KEY", "private-key"); vi.stubEnv("GEMINI_MODEL", "gemini-test");
  const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "private provider details" }); vi.stubGlobal("fetch", fetcher);
  await expect(runPipeline({ steps: [step, step], image: Buffer.from("x"), context: "", style: "Brainrot" })).rejects.toThrow("provider could not run");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("rejects oversized expanded prompts before making another paid provider request", async () => {
  vi.stubEnv("GEMINI_API_KEY", "test-key"); vi.stubEnv("GEMINI_MODEL", "gemini-test");
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "x".repeat(8000) }] } }] }) }); vi.stubGlobal("fetch", fetcher);
  await expect(runPipeline({ steps: [step, { ...step, systemPrompt: "{{previous_output}}".repeat(4) }], image: Buffer.from("x"), context: "", style: "Brainrot" })).rejects.toThrow("too much text");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
