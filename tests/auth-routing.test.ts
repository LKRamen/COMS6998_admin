import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { oauth, headerOrigin } = vi.hoisted(() => ({ oauth: vi.fn(), headerOrigin: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock("next/headers", () => ({ headers: async () => ({ get: headerOrigin }) }));
vi.mock("../lib/supabase", () => ({ sessionClient: async () => ({ auth: { signInWithOAuth: oauth } }) }));
import { login } from "../app/auth/actions";
const adminOrigin = "https://coms6998-admin-phi.vercel.app";
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("APP_ORIGIN", adminOrigin); headerOrigin.mockReturnValue(adminOrigin); oauth.mockResolvedValue({ data: { url: "https://accounts.google.com/test" }, error: null }); });
afterEach(() => vi.unstubAllEnvs());
it("sends Google back to the admin callback, never the consumer feed", async () => {
 await expect(login()).rejects.toThrow("redirect:https://accounts.google.com/test");
 expect(oauth).toHaveBeenCalledWith({ provider: "google", options: { redirectTo: `${adminOrigin}/auth/callback`, queryParams: { prompt: "select_account" } } });
});
it("starts preview-host logins on the canonical admin host before creating PKCE state", async () => {
 headerOrigin.mockReturnValue("https://admin-preview.vercel.app");
 await expect(login()).rejects.toThrow(`redirect:${adminOrigin}/login`);
 expect(oauth).not.toHaveBeenCalled();
});
it("fails closed when the admin origin is missing", async () => {
 vi.stubEnv("APP_ORIGIN", "");
 await expect(login()).rejects.toThrow("redirect:/login?error=config");
 expect(oauth).not.toHaveBeenCalled();
});
