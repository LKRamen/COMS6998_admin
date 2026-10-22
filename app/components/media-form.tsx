"use client";
/* eslint-disable @next/next/no-img-element -- Private images require the viewer's session cookies. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { captionStyles } from "../../lib/caption-input";
import type { Media } from "../../lib/data";
export default function MediaForm({ media }: { media?: Media }) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [deleting, setDeleting] = useState(false),
    [confirmation, setConfirmation] = useState("");
  async function submit(form: FormData) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/media", {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "This change could not be saved.");
      if (form.get("action") === "delete") {
        router.push(`/media${result.warning ? "?cleanup=pending" : ""}`);
      } else router.push(`/media/${result.id}?saved=1`);
      router.refresh();
      setDeleting(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="editor-grid">
      <form className="panel editor" onSubmit={(event) => { event.preventDefault(); void submit(new FormData(event.currentTarget)); }}>
        <input
          type="hidden"
          name="action"
          value={media ? "update" : "create"}
        />
        {media && (
          <>
            <input type="hidden" name="id" value={media.id} />
            <input type="hidden" name="updated_at" value={media.updated_at} />
          </>
        )}
        <div className="panel-title">
          <h2>
            {media ? "Edit the details" : "Make something worth reacting to."}
          </h2>
          <span className="subtle">
            {media ? "Changes are audited" : "Powered by Gemini"}
          </span>
        </div>
        {!media && (
          <label className="upload-field">
            <span>01 / Start with a photo</span>
            <input
              type="file"
              name="photo"
              accept="image/jpeg,image/png,image/webp"
              required
              disabled={busy}
            />
            <small>JPEG, PNG, or WebP · Under 5 MiB · Still images only</small>
          </label>
        )}
        {media && (
          <label>
            Visible caption
            <textarea
              name="caption"
              maxLength={240}
              defaultValue={media.caption}
              required
              disabled={busy}
              rows={3}
            />
            <small>
              Editing the caption also updates the text in the rendered image.
            </small>
          </label>
        )}
        <label>
          {media ? "Context" : "02 / Add a little context (optional)"}
          <textarea
            name="context"
            maxLength={500}
            defaultValue={media?.context ?? ""}
            placeholder="What’s happening? Leave blank and let the image do the talking."
            rows={3}
            disabled={busy}
          />
        </label>
        <div className="form-row">
          <label>
            {media ? "Humor style" : "03 / Pick the energy"}
            <select
              name="style"
              defaultValue={media?.style ?? "Quip"}
              disabled={busy}
            >
              {captionStyles.map((style) => (
                <option key={style}>{style}</option>
              ))}
            </select>
          </label>
          <label>
            Visibility
            <select
              name="status"
              defaultValue={media?.status ?? "draft"}
              disabled={busy}
            >
              <option value="draft">Draft · private</option>
              <option
                value="published"
                disabled={!!media && !media.selected_caption_id}
              >
                Published · visible on Quip
              </option>
            </select>
          </label>
        </div>
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        {busy && (
          <p className="working" role="status">
            <span className="spinner" />
            {media
              ? "Saving your changes…"
              : "Reading your image, writing three captions, and rendering your meme. This can take about a minute…"}
          </p>
        )}
        <div className="form-actions">
          <Link href="/media" className="text-link">
            Cancel
          </Link>
          <button className="button primary" disabled={busy}>
            {busy
              ? "Working…"
              : media
                ? "Save changes"
                : "Generate & create media"}
            <span>↗</span>
          </button>
        </div>
      </form>
      <aside className="editor-aside">
        {media ? (
          <>
            <div className="panel preview">
              <span className="eyebrow">CURRENT RENDER</span>
              <img
                key={media.updated_at}
                src={`/api/image/${media.id}?v=${encodeURIComponent(media.updated_at)}`}
                alt={media.caption || "Original uploaded photo"}
              />
              <a
                href={`/api/image/${media.id}?original=1`}
                target="_blank"
                rel="noreferrer"
                className="text-link"
              >
                View original photo ↗
              </a>
            </div>
            <div className="panel provenance">
              <span className="eyebrow">GENERATION RECEIPT</span>
              <p>
                <b>{media.generation?.model ?? "Not generated yet"}</b>
              </p>
              <p>
                {media.generation?.prompt_version ?? "No generation provenance"}
              </p>
              {media.candidates?.map((c, i) => (
                <div className="candidate" key={c.id}>
                  <small>OPTION {i + 1}</small>
                  <p>{c.text}</p>
                </div>
              ))}
              <small>
                Original AI text stays intact when the visible caption is
                edited.
              </small>
            </div>
            <div className="danger-zone">
              <h3>Delete this media</h3>
              <p>
                Removes the media and its associated captions, generation
                history, and votes. This cannot be undone.
              </p>
              <button
                className="button danger"
                disabled={busy}
                onClick={() => {
                  setError("");
                  setDeleting(true);
                }}
              >
                Delete media
              </button>
            </div>
          </>
        ) : (
          <div className="create-note">
            <span className="eyebrow">A SMALL CREATIVE BRIEF</span>
            <h2>
              Your photo.
              <br />
              AI’s punchline.
              <br />
              Your call.
            </h2>
            <p>
              Gemini generates three captions grounded in the image. The first
              becomes the visible caption; all three are saved for review.
            </p>
            <p>
              Keep it as a draft to review, or publish it directly to the Quip
              community.
            </p>
            <span className="note-star" aria-hidden="true">
              ✳
            </span>
          </div>
        )}
      </aside>
      {deleting && media && (
        <div className="modal-backdrop">
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
          >
            <span className="eyebrow">PERMANENT DELETION</span>
            <h2 id="delete-title">Delete this media?</h2>
            <p>
              Its captions and votes will also be removed. Type <b>DELETE</b> to
              confirm.
            </p>
            <form onSubmit={(event) => { event.preventDefault(); void submit(new FormData(event.currentTarget)); }}>
              <input type="hidden" name="action" value="delete" />
              <input type="hidden" name="id" value={media.id} />
              <input type="hidden" name="updated_at" value={media.updated_at} />
              <label>
                Confirmation
                <input
                  autoFocus
                  name="confirm"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  autoComplete="off"
                  disabled={busy}
                />
              </label>
              {error && (
                <p className="error-box" role="alert">
                  {error}
                </p>
              )}
              <div className="form-actions">
                <button
                  type="button"
                  className="button"
                  disabled={busy}
                  onClick={() => {
                    setDeleting(false);
                    setConfirmation("");
                  }}
                >
                  Keep media
                </button>
                <button
                  className="button danger"
                  disabled={busy || confirmation !== "DELETE"}
                >
                  {busy ? "Deleting…" : "Permanently delete"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
