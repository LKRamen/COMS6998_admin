// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import CatalogRecordActions from "../app/components/catalog-record-actions";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const record = { id: "test-id", version: 2, term: "Old", definition: "Definition" };

it("shows editable data only once, with secondary metadata collapsed", () => {
  render(<CatalogRecordActions kind="terms" record={record} />);
  fireEvent.click(screen.getByRole("button", { name: "View / edit" }));
  const details = within(screen.getByRole("dialog"));
  expect(details.getAllByDisplayValue("Old")).toHaveLength(1);
  expect(details.queryByText("Old")).toBeNull();
  expect(details.getAllByDisplayValue("Definition")).toHaveLength(1);
  expect(details.getByText("Record information").parentElement?.hasAttribute("open")).toBe(false);
  fireEvent.click(details.getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("does not delete on the trash click or cancel, and restores focus", () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(<CatalogRecordActions kind="terms" record={record} />);
  const trigger = screen.getByRole("button", { name: "Delete Old" });
  fireEvent.click(trigger);
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(fetcher).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(trigger);
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("deletes only after confirmation with the original id and version", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  vi.stubGlobal("fetch", fetcher);
  render(<CatalogRecordActions kind="terms" record={record} />);
  fireEvent.click(screen.getByRole("button", { name: "Delete Old" }));
  expect(screen.queryByRole("textbox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Delete record" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Record deleted."));
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ action: "delete", data: {}, id: "test-id", version: 2, confirm: "DELETE" });
});

it("retains a failed delete for retry without hiding the record", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "This record is still in use." }) });
  vi.stubGlobal("fetch", fetcher);
  render(<CatalogRecordActions kind="terms" record={record} />);
  fireEvent.click(screen.getByRole("button", { name: "Delete Old" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete record" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("still in use"));
  expect(screen.getByRole("button", { name: "Delete record" }).hasAttribute("disabled")).toBe(false);
  expect(screen.queryByRole("status")).toBeNull();
});

it("keeps read-only chains read-only and links to the chain's steps and mix", () => {
  render(<CatalogRecordActions kind="prompt_chains" record={{ id: "chain-id", name: "Original chain", description: "Purpose" }} />);
  expect(screen.queryByTitle("Delete record")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Inspect chain" }));
  const details = within(screen.getByRole("dialog"));
  expect(details.getByText("Original chain")).toBeTruthy();
  expect(details.getByRole("link", { name: "View this chain’s steps →" }).getAttribute("href")).toBe("/catalog/prompt_chain_steps?q=chain-id");
  expect(details.getByRole("link", { name: "Edit this chain’s saved mix →" }).getAttribute("href")).toBe("/catalog/prompt_chain_mix?q=chain-id");
  expect(details.queryByRole("textbox")).toBeNull();
});

it("identifies an example by a bounded input excerpt when deleting", () => {
  const input = "A very recognizable example input. ".repeat(5);
  render(<CatalogRecordActions kind="ai_generation_examples" record={{ id: "example-id", version: 1, input, output: "Result", notes: "" }} />);
  const excerpt = input.slice(0, 80) + "…";
  fireEvent.click(screen.getByRole("button", { name: `Delete ${excerpt}` }));
  expect(within(screen.getByRole("dialog")).getByText(excerpt)).toBeTruthy();
  expect(within(screen.getByRole("dialog")).queryByText("example-id")).toBeNull();
});
