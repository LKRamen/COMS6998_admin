import { describe, it, expect } from "vitest";
import { parseCatalogInput, getCatalog } from "../lib/catalog";
describe("catalog input boundary", () => {
  it("rejects unknown collections and read-only writes", () => {
    expect(getCatalog("__proto__")).toBeUndefined();
    for (const kind of [
      "llm_responses",
      "generation_requests",
      "prompt_chains",
      "prompt_chain_steps",
      "profiles",
    ])
      expect(() => parseCatalogInput(kind, "delete", {})).toThrow();
  });
  it("normalizes domains and email addresses", () => {
    expect(
      parseCatalogInput("allowed_signup_domains", "create", {
        domain: " Columbia.EDU ",
      }),
    ).toEqual({ domain: "columbia.edu" });
    expect(
      parseCatalogInput("whitelisted_emails", "create", {
        email: " Person@Columbia.EDU ",
      }),
    ).toEqual({ email: "person@columbia.edu" });
  });
  it("rejects unsafe and malformed field values", () => {
    expect(() =>
      parseCatalogInput("llm_providers", "create", {
        name: "X",
        api_base_url: "javascript:alert(1)",
      }),
    ).toThrow();
    expect(() =>
      parseCatalogInput("terms", "create", {
        term: "T",
        definition: "D",
        id: "overridden",
      }),
    ).toThrow();
    expect(() =>
      parseCatalogInput("terms", "create", { term: " ", definition: "D" }),
    ).toThrow();
    expect(() =>
      parseCatalogInput("allowed_signup_domains", "create", {
        domain: "https://columbia.edu",
      }),
    ).toThrow();
  });
  it("enforces mix bounds and update-only operations", () => {
    expect(() =>
      parseCatalogInput("prompt_chain_mix", "create", {
        weight: 1,
        enabled: true,
      }),
    ).toThrow();
    for (const weight of [-1, 101, NaN, Infinity, "50"])
      expect(() =>
        parseCatalogInput("prompt_chain_mix", "update", {
          weight,
          enabled: true,
        }),
      ).toThrow();
    expect(
      parseCatalogInput("prompt_chain_mix", "update", {
        weight: 0,
        enabled: false,
      }),
    ).toEqual({ weight: 0, enabled: false });
  });
});
