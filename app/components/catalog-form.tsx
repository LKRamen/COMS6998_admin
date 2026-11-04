"use client";
import { useState, useId } from "react";
import { useRouter } from "next/navigation";
import { getCatalog } from "../../lib/catalog";
export default function CatalogForm({
  kind,
  record,
}: {
  kind: string;
  record?: Record<string, unknown>;
}) {
  const spec = getCatalog(kind)!,
    router = useRouter(),
    uid = useId();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      fd = new FormData(form);
    const action = record ? "update" : "create";
    const data = Object.fromEntries(
      spec.fields.map((f) => [
        f.key,
        f.type === "checkbox"
          ? fd.has(f.key)
          : f.type === "number"
            ? Number(fd.get(f.key))
            : String(fd.get(f.key) ?? ""),
      ]),
    );
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/catalog/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          data,
          id: record?.id,
          version: record?.version,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "The change could not be saved.");
      setSuccess(spec.savedMessage ?? "Changes saved.");
      if (!record) form.reset();
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Connection failed. Your inputs are still here.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="editor catalog-editor" onSubmit={submit}>
      {kind === "prompt_chain_mix" && (
        <div className="pipeline-impact">
          <h3>What this save changes</h3>
          <p>Only this chain’s saved mix settings. It does not edit prompts, switch models or publish a new pipeline.</p>
        </div>
      )}
      <fieldset disabled={busy}>
        {spec.fields.map((f) => (
          <label key={f.key} htmlFor={`${uid}-${f.key}`}>
            {f.label}
            {f.type === "textarea" ? (
              <textarea
                id={`${uid}-${f.key}`}
                aria-describedby={f.hint ? `${uid}-${f.key}-hint` : undefined}
                name={f.key}
                rows={3}
                required={!f.optional}
                maxLength={f.max}
                defaultValue={String(record?.[f.key] ?? "")}
              />
            ) : f.type === "checkbox" ? (
              <input
                id={`${uid}-${f.key}`}
                aria-describedby={f.hint ? `${uid}-${f.key}-hint` : undefined}
                name={f.key}
                type="checkbox"
                defaultChecked={record ? Boolean(record[f.key]) : true}
              />
            ) : (
              <input
                id={`${uid}-${f.key}`}
                aria-describedby={f.hint ? `${uid}-${f.key}-hint` : undefined}
                name={f.key}
                type={f.type ?? "text"}
                required={!f.optional}
                maxLength={f.max}
                min={f.type === "number" ? 0 : undefined}
                max={f.type === "number" ? f.max : undefined}
                step={f.type === "number" ? "any" : undefined}
                defaultValue={String(record?.[f.key] ?? "")}
              />
            )}
            {f.hint && <small id={`${uid}-${f.key}-hint`}>{f.hint}</small>}
          </label>
        ))}
        <button
          className="button primary"
          type="submit"
          value={record ? "update" : "create"}
        >
          {busy ? "Saving…" : spec.saveAction ?? (record ? "Save changes" : "Create record")}
        </button>
      </fieldset>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="success-box" role="status">
          {success}
        </p>
      )}
    </form>
  );
}
