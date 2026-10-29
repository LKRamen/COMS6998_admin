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
    const action =
      (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ??
      (record ? "update" : "create");
    const data =
      action === "delete"
        ? {}
        : Object.fromEntries(
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
          confirm: fd.get("confirm"),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "The change could not be saved.");
      setSuccess(action === "delete" ? "Record deleted." : "Changes saved.");
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
      <fieldset disabled={busy}>
        {spec.fields.map((f) => (
          <label key={f.key} htmlFor={`${uid}-${f.key}`}>
            {f.label}
            {f.type === "textarea" ? (
              <textarea
                id={`${uid}-${f.key}`}
                name={f.key}
                rows={5}
                required={!f.optional}
                maxLength={f.max}
                defaultValue={String(record?.[f.key] ?? "")}
              />
            ) : f.type === "checkbox" ? (
              <input
                id={`${uid}-${f.key}`}
                name={f.key}
                type="checkbox"
                defaultChecked={record ? Boolean(record[f.key]) : true}
              />
            ) : (
              <input
                id={`${uid}-${f.key}`}
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
            {f.hint && <small>{f.hint}</small>}
          </label>
        ))}
        <button
          className="button primary"
          type="submit"
          value={record ? "update" : "create"}
        >
          {busy ? "Saving…" : record ? "Save changes" : "Create record"}
        </button>
        {record && spec.mode === "crud" && (
          <details className="catalog-delete">
            <summary>Delete this record</summary>
            <p>This permanently deletes the record. Type DELETE to confirm.</p>
            <label htmlFor={`${uid}-confirm`}>
              Confirmation
              <input
                id={`${uid}-confirm`}
                name="confirm"
                autoComplete="off"
                placeholder="DELETE"
              />
            </label>
            <button
              className="button danger"
              type="submit"
              value="delete"
              formNoValidate
            >
              Delete record
            </button>
          </details>
        )}
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
