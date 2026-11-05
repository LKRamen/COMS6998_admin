"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { sessionClient } from "../../lib/supabase";
import { resolveOAuthOrigin } from "../../lib/oauth-origin";
export async function login() {
  const stableOrigin = process.env.APP_ORIGIN;
  if (!stableOrigin) redirect("/login?error=config");
  const requestOrigin = (await headers()).get("origin");
  const origin = resolveOAuthOrigin(requestOrigin, stableOrigin, process.env.VERCEL_URL);
  // Keep the verifier cookie and callback on this exact, trusted deployment.
  if (!origin) redirect(`${stableOrigin}/login`);
  const client = await sessionClient();
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) redirect("/login?error=oauth");
  redirect(data.url);
}
export async function logout() {
  const client = await sessionClient();
  await client.auth.signOut();
  redirect("/login");
}
