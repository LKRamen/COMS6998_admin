// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import Nav from "../app/components/nav";
import PipelineGuide from "../app/components/pipeline-guide";
import { pipelineSections, isPipelinePath } from "../lib/pipeline-navigation";
vi.mock("next/navigation", () => ({ usePathname: () => "/catalog/ai_generation_examples" }));
afterEach(cleanup);
it("keeps a single active studio entry across its catalog screens", () => {
  render(<Nav />);
  const nav = screen.getByRole("navigation");
  expect(within(nav).getByRole("link", { name: /Pipeline studio/ }).getAttribute("aria-current")).toBe("page");
  expect(within(nav).queryByRole("link", { name: "AI generation examples" })).toBeNull();
  expect(within(nav).queryByRole("link", { name: /Allowed signup domains/ })).toBeNull();
  expect(within(nav).queryByRole("link", { name: /Whitelisted email/ })).toBeNull();
});
it("makes every pipeline collection reachable with the current section marked", () => {
  render(<PipelineGuide kind="terms" />);
  const links = within(screen.getByRole("navigation", { name: "Pipeline studio sections" })).getAllByRole("link");
  expect(links).toHaveLength(pipelineSections.reduce((total, section) => total + section.links.length, 0));
  expect(screen.getByRole("link", { name: "Terms" }).getAttribute("aria-current")).toBe("page");
  expect(isPipelinePath("/catalog/terms")).toBe(true);
  expect(isPipelinePath("/catalog/allowed_signup_domains")).toBe(true);
  expect(isPipelinePath("/catalog/whitelisted_emails")).toBe(true);
  expect(screen.getByRole("link", { name: "Signup domains" }).getAttribute("href")).toBe("/catalog/allowed_signup_domains");
  expect(screen.getByRole("link", { name: "Email whitelist" }).getAttribute("href")).toBe("/catalog/whitelisted_emails");
});

