"use client";
/* eslint-disable @next/next/no-img-element -- Local upload preview. */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { captionStyles } from "../../lib/caption-input";

export default function MediaCreator() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [style, setStyle] = useState<string>("Brainrot");
  const [context, setContext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  function choose(file?: File) {
    if (!file || busy) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError("Choose a JPEG, PNG, or WebP photo under 5 MiB.");
      return;
    }
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
    setError("");
  }
  async function generate() {
    if (!photo || busy) return;
    setBusy(true); setError("");
    try {
      const form = new FormData();
      form.set("action", "create"); form.set("status", "draft");
      form.set("photo", photo); form.set("style", style); form.set("context", context);
      const response = await fetch("/api/media", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Generation failed. Your photo and settings are still here; please retry.");
      router.push(`/media/${result.id}?created=1`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
      setBusy(false);
    }
  }
  return <>
    <ol className="creation-steps" aria-label="Creation steps"><li aria-current="step">1. Photo & style</li><li>2. Choose a caption</li><li>3. Save or publish</li></ol>
    <form className="editor-grid media-creator" onSubmit={e => { e.preventDefault(); void generate(); }}>
      <section className="panel editor">
        <h2>Your photo. Your starting point.</h2>
        <div className="photo-drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); choose(e.dataTransfer.files[0]); }}>
          {preview ? <img src={preview} alt="Selected photo preview" /> : <div className="photo-placeholder"><span aria-hidden="true">＋</span><p>Drop a photo here</p><small>Or choose one from your device</small></div>}
          <button className="button" type="button" disabled={busy} onClick={() => input.current?.click()}>{photo ? "Choose another photo" : "Choose a photo"}</button>
          <input ref={input} id="creation-photo" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload photo" hidden disabled={busy} onChange={e => { choose(e.target.files?.[0]); e.target.value = ""; }} />
          <p className="subtle">JPEG, PNG, or WebP · Under 5 MiB</p>
        </div>
      </section>
      <section className="panel editor">
        <h2>Give it some personality.</h2>
        <fieldset className="style-picker" disabled={busy}><legend>Humor style</legend><div>{captionStyles.map(s => <button key={s} type="button" aria-pressed={s === style} onClick={() => setStyle(s)}>{s}</button>)}</div></fieldset>
        <label>Context (optional)<textarea value={context} onChange={e => setContext(e.target.value)} maxLength={500} rows={3} disabled={busy} placeholder="What’s the story behind this photo?" /><small>Give the AI a detail to work with, or let the image do the talking.</small></label>
        <p className="creation-note">You’ll get three captions to choose from. Your meme stays private until you publish it.</p>
        {error && <p className="error-box" role="alert">{error}</p>}
        {busy && <p className="working" role="status"><span className="spinner" />Writing three captions and saving your private draft. This can take about a minute…</p>}
        <div className="form-actions"><Link href="/media" className="text-link">Back to library</Link><button className="button primary" disabled={!photo || busy}>{busy ? "Generating…" : "Generate 3 captions"}</button></div>
      </section>
    </form>
  </>;
}
