// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PipelineEditor from "../app/components/pipeline-editor";
import type { PipelineDraft, PipelineTest } from "../lib/pipelines";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function savedDraft(): PipelineDraft {
  return {
    id: "b83d17b4-3943-4694-a070-559ba0d6c232",
    version: 4,
    name: "Image-first humor",
    description: "Describe before captioning.",
    style: "Brainrot",
    steps: [
      { name: "Understand image", model: "default", systemPrompt: "Describe visible details.", userPrompt: "Context: {{context}}" },
      { name: "Write captions", model: "default", systemPrompt: "Write distinct captions.", userPrompt: "Previous: {{previous_output}}" },
    ],
    active_release: null,
    latest_test: null,
  };
}
function passedTest(draft: PipelineDraft, revision = draft.version): PipelineTest {
  return {
    id: "0fadfd5d-3967-4484-bb24-a6dfbffbd90f", pipeline_id: draft.id, draft_version: revision,
    status: "succeeded", error: null, created_at: "2026-10-29T15:00:00Z",
    snapshot: { name: draft.name, description: draft.description, style: draft.style, steps: draft.steps },
    results: { steps: [], captions: ["Caption one", "Caption two", "Caption three"] },
  };
}
const models = [{ value: "default", label: "Deployment default" }];

it("requires saved edits before a test or publication", () => {
  const draft = savedDraft();
  draft.latest_test = passedTest(draft);
  render(<PipelineEditor initialDraft={draft} models={models} />);
  expect((screen.getByRole("button", { name: "Test saved draft" }) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.getByRole("button", { name: "Review publication" })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Pipeline name"), { target: { value: "Unsaved new name" } });
  expect((screen.getByRole("button", { name: "Test saved draft" }) as HTMLButtonElement).closest("fieldset")?.disabled).toBe(true);
  expect(screen.queryByRole("button", { name: "Review publication" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Publish for Brainrot" })).toBeNull();
});

it("does not publish an older successful test", () => {
  const draft = savedDraft();
  draft.latest_test = passedTest(draft, draft.version - 1);
  render(<PipelineEditor initialDraft={draft} models={models} />);
  expect(screen.queryByRole("button", { name: "Review publication" })).toBeNull();
  expect(screen.getByText(/These results belong to an older draft/)).toBeTruthy();
});

it("requires explicit review before sending the tested publication and active release", async () => {
  const draft = savedDraft();
  draft.latest_test = passedTest(draft);
  draft.active_release = { ...draft, id: "6a4444e5-f007-4cbb-a329-145bd994927c", pipeline_id: "c2b5febd-742d-4096-abaa-a5443f99adef", draft_version: 2, name: "Other active pipeline" };
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ release: { ...draft, id: "new-release", pipeline_id: draft.id, draft_version: draft.version } }) });
  vi.stubGlobal("fetch", fetcher);
  render(<PipelineEditor initialDraft={draft} models={models} />);
  expect(screen.queryByRole("button", { name: "Publish for Brainrot" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Review publication" }));
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.getByText(/This replaces Other active pipeline/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Publish for Brainrot" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  const form = fetcher.mock.calls[0][1].body as FormData;
  expect(Object.fromEntries(form)).toMatchObject({ action: "publish", version: "4", testId: draft.latest_test!.id, expectedRelease: draft.active_release!.id });
});

it("reorders steps and requires a new save and test", () => {
  const draft = savedDraft();
  draft.latest_test = passedTest(draft);
  render(<PipelineEditor initialDraft={draft} models={models} />);
  fireEvent.click(screen.getByRole("button", { name: "Move step 2 up" }));
  expect(screen.getAllByLabelText("Step name").map((element) => (element as HTMLInputElement).value)).toEqual(["Write captions", "Understand image"]);
  expect((screen.getByRole("button", { name: "Save draft" }) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.queryByRole("button", { name: "Review publication" })).toBeNull();
});

it("keeps edited content when a save fails", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Draft changed in another tab. Reload before saving." }) });
  vi.stubGlobal("fetch", fetcher);
  render(<PipelineEditor initialDraft={savedDraft()} models={models} />);
  fireEvent.change(screen.getByLabelText("Pipeline name"), { target: { value: "Keep this edit" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("another tab"));
  expect((screen.getByLabelText("Pipeline name") as HTMLInputElement).value).toBe("Keep this edit");
  const form = fetcher.mock.calls[0][1].body as FormData;
  expect(form.get("version")).toBe("4");
  expect(JSON.parse(String(form.get("data"))).name).toBe("Keep this edit");
});
