"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

export function liveMode(path: string) {
  if (["/", "/users", "/ratings", "/catalog/generation_requests", "/catalog/llm_responses"].includes(path)) return "automatic";
  if (["/media", "/pipelines"].includes(path)) return "review";
  return "editing";
}

export default function LiveUpdates({ initialRevision }: { initialRevision: string }) {
  const path = usePathname(), router = useRouter();
  const revision = useRef(initialRevision);
  const [status, setStatus] = useState("Connecting to live updates…");
  const [changed, setChanged] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const mode = liveMode(path);

  useEffect(() => {
    const client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
    let disposed = false, checking = false, timer: ReturnType<typeof setTimeout> | undefined;
    let dirty = false;
    const update = () => {
      if (disposed || document.visibilityState === "hidden" || !dirty) return;
      dirty = false;
      if (liveMode(path) === "automatic") startTransition(() => router.refresh());
      else setChanged(true);
    };
    const receive = (next: unknown) => {
      if (disposed || next == null || String(next) === revision.current) return;
      revision.current = String(next);
      dirty = true;
      // One refresh per burst, even when generation updates several tables.
      if (!timer) timer = setTimeout(() => { timer = undefined; update(); }, 750);
    };
    const check = async () => {
      if (disposed || checking || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const { data, error } = await client.from("admin_live_signal").select("revision").eq("id", true).single();
        if (disposed) return;
        if (error) setStatus("Live updates unavailable. Check your connection or sign in again.");
        else receive(data.revision);
      } catch {
        if (!disposed) setStatus("Live updates unavailable. Reconnecting…");
      } finally { checking = false; }
    };
    const channel = client.channel(`quip-admin-live-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "admin_live_signal" }, payload => receive(payload.new.revision));
    // Join only after cookie-session initialization; an early join can use the anon key.
    void (async () => {
      try {
        const { data, error } = await client.auth.getSession();
        if (disposed) return;
        if (error || !data.session) {
          setStatus("Live updates unavailable. Sign in again to reconnect."); return;
        }
        await client.realtime.setAuth(data.session.access_token);
        if (disposed) return;
        channel.subscribe(state => {
          if (disposed) return;
          setStatus(state === "SUBSCRIBED" ? "Live updates connected" : "Reconnecting to live updates…");
          if (state === "SUBSCRIBED") void check();
        });
      } catch { if (!disposed) setStatus("Live updates unavailable. Reconnecting…"); }
    })();
    const resume = () => { update(); void check(); };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    // Recover missed events after connection loss; paused in background tabs.
    const recovery = setInterval(() => void check(), 60000);
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      clearInterval(recovery);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      void client.removeChannel(channel);
    };
  }, [path, router]);

  return <div className="live-updates" role="status" aria-live="polite">
    <span>{changed ? "New updates available" : refreshing ? "Updating…" : status}</span>
    {changed && mode !== "editing" && <button type="button" disabled={refreshing} onClick={() => {
      setChanged(false); startTransition(() => router.refresh());
    }}>Show updates</button>}
    {changed && mode === "editing" && <span>Save your edits, then reload to see the latest changes.</span>}
  </div>;
}
