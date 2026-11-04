"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getCatalog } from "../../lib/catalog";
import CatalogForm from "./catalog-form";
import { Badge } from "./ui";

function label(key: string) {
  return key.replaceAll("_", " ").replace(/^./, (s) => s.toUpperCase());
}

export function CatalogValue({ name, value }: { name: string; value: unknown }) {
  if (value === null || value === undefined) return <span className="subtle">—</span>;
  if (typeof value === "boolean") return <Badge tone={value ? "green" : "neutral"}>{value ? "Enabled" : "Disabled"}</Badge>;
  if (typeof value === "object") return <pre className="record-json">{JSON.stringify(value, null, 2)}</pre>;
  const targets: Record<string, string> = {
    chain_id: "/catalog/prompt_chains?q=", provider_id: "/catalog/llm_providers?q=",
    run_id: "/catalog/llm_responses?q=", generation_run_id: "/catalog/llm_responses?q=", moment_id: "/media/",
  };
  if (targets[name]) return <Link className="text-link" href={targets[name] + encodeURIComponent(String(value))}>{String(value)}</Link>;
  return String(value);
}

export default function CatalogRecordActions({ kind, record }: {
  kind: string;
  record: Record<string, unknown> & { id: string; version?: number };
}) {
  const spec = getCatalog(kind)!;
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const inFlight = useRef(false);
  const uid = useId();
  const [mode, setMode] = useState<"view" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleted, setDeleted] = useState(false);
  useEffect(() => {
    if (mode && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [mode]);
  function open(next: "view" | "delete", button: HTMLButtonElement) {
    opener.current = button;
    setError("");
    setMode(next);
  }
  function close() {
    if (inFlight.current) return;
    dialog.current?.close();
    setMode(null);
    opener.current?.focus();
  }
  async function remove() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/catalog/${kind}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", data: {}, id: record.id, version: record.version, confirm: "DELETE" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The record could not be deleted.");
      setDeleted(true);
      inFlight.current = false;
      close();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed. Please retry.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const editable = new Set(spec.fields.map((field) => field.key));
  const metadataKeys = new Set(["id", "version", "created_at", "updated_at"]);
  const entries = Object.entries(record).filter(([key]) => !editable.has(key));
  const content = entries.filter(([key]) => !metadataKeys.has(key));
  const metadata = entries.filter(([key]) => metadataKeys.has(key));
  const exampleInput = typeof record.input === "string" ? record.input.trim() : "";
  const identity = String(record.name ?? record.term ?? record.domain ?? record.email ?? (exampleInput ? `${exampleInput.slice(0, 80)}${exampleInput.length > 80 ? "\u2026" : ""}` : record.id));
  function fields(items: [string, unknown][]) {
    return <dl className="catalog-record-fields">{items.map(([key, value]) => <div key={key}><dt>{label(key)}</dt><dd><CatalogValue name={key} value={value} /></dd></div>)}</dl>;
  }
  return <div className="catalog-row-actions">
    {deleted ? <span role="status">Record deleted.</span> : <>
      <button className="text-button" type="button" onClick={(event) => open("view", event.currentTarget)}>{spec.detailAction ?? (spec.mode !== "read" ? "View / edit" : "View details")}</button>
      {spec.mode === "crud" && <button className="catalog-trash" type="button" aria-label={`Delete ${identity}`} title="Delete record" onClick={(event) => open("delete", event.currentTarget)}>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></svg>
      </button>}
    </>}
    <dialog ref={dialog} className="catalog-record-dialog" aria-labelledby={`${uid}-title`} onCancel={(event) => { event.preventDefault(); close(); }} onClose={() => setMode(null)}>
      {mode && <>
        <header className="catalog-dialog-header"><h2 id={`${uid}-title`}>{mode === "delete" ? "Delete record?" : spec.title}</h2><button className="button" type="button" disabled={busy} onClick={close}>{mode === "delete" ? "Cancel" : "Close"}</button></header>
        {mode === "delete" ? <div className="catalog-delete-confirm">
          <p>Delete <strong>{identity}</strong>? This cannot be undone.</p>
          <button className="button danger" type="button" disabled={busy} onClick={remove}>{busy ? "Deleting…" : "Delete record"}</button>
          {error && <p className="error-box" role="alert">{error}</p>}
        </div> : <>
          {spec.mode !== "read" && <CatalogForm kind={kind} record={record} />}
          {content.length > 0 && fields(content)}
          {kind === "prompt_chains" && <nav className="catalog-related" aria-label="Related chain records"><Link className="text-link" href={`/catalog/prompt_chain_steps?q=${encodeURIComponent(record.id)}`}>View this chain’s steps →</Link><Link className="text-link" href={`/catalog/prompt_chain_mix?q=${encodeURIComponent(record.id)}`}>Edit this chain’s saved mix →</Link></nav>}
          {metadata.length > 0 && <details className="catalog-record-metadata"><summary>Record information</summary>{fields(metadata)}</details>}
        </>}
      </>}
    </dialog>
  </div>;
}
