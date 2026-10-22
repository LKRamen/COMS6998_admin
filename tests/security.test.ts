import { describe, expect, it } from "vitest";
import { googleSession, safeReturnPath } from "../lib/security";
describe("admin session boundary", () => {
  it("denies non-Google and password sessions even when a Google identity is linked", () => {
    expect(
      googleSession({
        app_metadata: { provider: "google" },
        amr: [{ method: "password" }],
      }),
    ).toBe(false);
    expect(
      googleSession({
        app_metadata: { provider: "email" },
        amr: [{ method: "oauth" }],
      }),
    ).toBe(false);
    expect(googleSession(null)).toBe(false);
  });
  it("accepts a verified Google OAuth claim set", () => {
    expect(
      googleSession({
        app_metadata: { provider: "google" },
        amr: [{ method: "oauth" }],
      }),
    ).toBe(true);
  });
  it("rejects external and protocol-relative callback destinations", () => {
    for (const value of [
      "https://evil.test",
      "//evil.test",
      "/\\evil.test",
      "/auth/callback",
      "/login",
    ])
      expect(safeReturnPath(value)).toBe("/");
    expect(safeReturnPath("/media?page=2")).toBe("/media?page=2");
  });
});
