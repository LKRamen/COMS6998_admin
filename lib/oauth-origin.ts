/** Only trust configured hosts; never derive an OAuth destination from an arbitrary Origin. */
export function resolveOAuthOrigin(
  requestOrigin: string | null,
  stableOrigin: string,
  deploymentHost?: string,
  allowLocal = false,
): string | null {
  if (!requestOrigin) return null;
  try {
    const url = new URL(requestOrigin);
    // Origin headers have no credentials, path, query, or fragment.
    if (url.origin !== requestOrigin) return null;
    if (requestOrigin === stableOrigin) return requestOrigin;
    if (deploymentHost && requestOrigin === `https://${deploymentHost}`) return requestOrigin;
    if (allowLocal && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return requestOrigin;
  } catch { /* A malformed Origin must never start OAuth. */ }
  return null;
}
