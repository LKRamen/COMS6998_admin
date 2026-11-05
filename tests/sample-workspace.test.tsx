// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import SampleWorkspace from "../app/components/sample-workspace";
import { sampleDataset } from "../lib/sample-data";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("filters media and follows connected records without live requests", () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  render(<SampleWorkspace />);
  expect(screen.getByText("Sample data · fictional records · read-only")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Search media"), { target: { value: sampleDataset.media[0].id } });
  expect(screen.getByRole("status").textContent).toBe("1 matching record");
  fireEvent.click(screen.getByRole("button", { name: `Inspect media: ${sampleDataset.media[0].caption}` }));
  fireEvent.click(screen.getByRole("button", { name: "View generation run" }));
  const details = screen.getByRole("region", { name: "Sample record details" });
  expect(within(details).getByText("Synthetic generation history · no AI request was made for this record.")).toBeTruthy();
  expect(within(details).getByText(sampleDataset.media[0].runId)).toBeTruthy();
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: /delete|save|generate/i })).toBeNull();
});
it("filters failed runs and shows their error instead of a fabricated output", () => {
  render(<SampleWorkspace />);
  fireEvent.click(screen.getByRole("tab", { name: /Generation runs/ }));
  fireEvent.change(screen.getByLabelText("Filter generation runs"), { target: { value: "failed" } });
  expect(screen.getByRole("status").textContent).toBe("4 matching records");
  const failed = sampleDataset.runs.find(r => r.status === "failed")!;
  fireEvent.click(screen.getByRole("button", { name: failed.id }));
  const details = screen.getByRole("region", { name: "Sample record details" });
  expect(within(details).getByText(failed.error!)).toBeTruthy();
  expect(within(details).queryByRole("heading", { name: "Output" })).toBeNull();
});
it("pages the ledger and resets filters when switching record types", () => {
  render(<SampleWorkspace />);
  fireEvent.click(screen.getByRole("tab", { name: /Votes/ }));
  const firstCaption = within(screen.getByRole("tabpanel")).getAllByRole("row")[1].textContent;
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(within(screen.getByRole("tabpanel")).getAllByRole("row")[1].textContent).not.toBe(firstCaption);
  fireEvent.change(screen.getByLabelText("Search votes"), { target: { value: "no-match-987" } });
  expect(screen.getByText("No sample records match.")).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: /Community/ }));
  expect(screen.getByRole("status").textContent).toBe("18 matching records");
  expect((screen.getByLabelText("Search community") as HTMLInputElement).value).toBe("");
});
