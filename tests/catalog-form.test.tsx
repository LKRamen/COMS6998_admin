// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import CatalogForm from "../app/components/catalog-form";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("keeps edits after a failed save and sends the record version", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Record changed in another tab." }),
    });
  vi.stubGlobal("fetch", fetcher);
  render(
    <CatalogForm
      kind="terms"
      record={{
        id: "test-id",
        version: 3,
        term: "Old",
        definition: "Definition",
      }}
    />,
  );
  fireEvent.change(screen.getByLabelText("Term"), {
    target: { value: "New term" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("another tab"),
  );
  expect((screen.getByLabelText("Term") as HTMLInputElement).value).toBe(
    "New term",
  );
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
    action: "update",
    version: 3,
    data: { term: "New term" },
  });
});
