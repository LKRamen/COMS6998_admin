import { describe, expect, it } from "vitest";
import { resolveOAuthOrigin } from "../lib/oauth-origin";
const stable = "https://app.vercel.app";
const deployment = "app-commit-team.vercel.app";
describe("OAuth origin allow list", () => {
  it("accepts only the configured stable origin and current deployment", () => {
    expect(resolveOAuthOrigin(stable, stable, deployment)).toBe(stable);
    expect(resolveOAuthOrigin(`https://${deployment}`, stable, deployment)).toBe(`https://${deployment}`);
    expect(resolveOAuthOrigin(`https://${deployment}`, stable)).toBeNull();
  });
  it.each([null, "null", "not a URL", "https://evil.test", "https://app.vercel.app.evil.test", "https://app.vercel.app@evil.test", "https://app.vercel.app/", "https://app.vercel.app/path", "https://app.vercel.app?next=evil", "https://other-commit-team.vercel.app", "http://app-commit-team.vercel.app"])("rejects an untrusted or malformed Origin: %s", (origin) => {
    expect(resolveOAuthOrigin(origin, stable, deployment)).toBeNull();
  });
  it("allows loopback only with the explicit development flag", () => {
    expect(resolveOAuthOrigin("http://localhost:3000", stable, deployment)).toBeNull();
    expect(resolveOAuthOrigin("http://localhost:3000", stable, deployment, true)).toBe("http://localhost:3000");
    expect(resolveOAuthOrigin("http://localhost.evil.test:3000", stable, deployment, true)).toBeNull();
  });
});
