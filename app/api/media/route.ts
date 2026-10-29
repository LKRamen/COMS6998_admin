import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { adminSession, AccessError } from "../../../lib/auth";
import { storageClient } from "../../../lib/supabase";
import { isSameOriginRequest } from "../../../lib/request-origin";
import { parseInputs, buildPrompts, isUuid } from "../../../lib/caption-input";
import {
  generateCaptions,
  geminiConfig,
  generationSettings,
} from "../../../lib/ai/gemini";
import { normalizePhoto } from "../../../lib/caption-photo";
import { renderMeme } from "../../../lib/meme-render";
import type { Collection, Media } from "../../../lib/data";
import { getPublishedPipeline } from "../../../lib/published-pipeline";
import { runPipeline } from "../../../lib/pipeline-runtime";
export const maxDuration = 120;
const bucket = "caption-photos";
export async function POST(request: Request) {
  let uploaded: string[] = [];
  try {
    const { client, user } = await adminSession();
    if (!isSameOriginRequest(request))
      return NextResponse.json(
        { error: "Invalid request origin." },
        { status: 403 },
      );
    const size = Number(request.headers.get("content-length") ?? 0);
    if (size > 6 * 1024 * 1024)
      return NextResponse.json(
        { error: "Choose a photo under 5 MiB." },
        { status: 413 },
      );
    const form = await request.formData(),
      action = String(form.get("action") ?? ""),
      id = String(form.get("id") ?? randomUUID());
    if (!isUuid(id) || !["create", "update", "delete"].includes(action))
      return NextResponse.json(
        { error: "Invalid media operation." },
        { status: 400 },
      );
    const storage = storageClient().storage.from(bucket);
    if (action === "delete") {
      if (form.get("confirm") !== "DELETE")
        return NextResponse.json(
          { error: "Type DELETE to confirm." },
          { status: 400 },
        );
      const { data, error } = await client.rpc("admin_media", {
        p_action: "delete",
        p_id: id,
        p_data: { updated_at: form.get("updated_at") },
      });
      if (error)
        return NextResponse.json(
          {
            error:
              error.code === "40001"
                ? "Media changed. Reload before deleting."
                : "The media could not be deleted.",
          },
          { status: 409 },
        );
      const paths = [data?.photo_path, data?.rendered_path].filter(
        (p): p is string => typeof p === "string",
      );
      const cleanup = paths.length ? await storage.remove(paths) : null;
      return NextResponse.json({
        ok: true,
        warning: cleanup?.error
          ? "Record deleted; file cleanup will need a retry."
          : undefined,
      });
    }
    const inputs = parseInputs({
      context: form.get("context"),
      style: form.get("style"),
    });
    const status = form.get("status");
    if (status !== "draft" && status !== "published")
      return NextResponse.json(
        { error: "Choose draft or published." },
        { status: 400 },
      );
    let bytes: Buffer,
      caption: string,
      payload: Record<string, unknown>,
      owner = user.id,
      oldRender: string | null = null;
    if (action === "create") {
      const file = form.get("photo");
      if (!(file instanceof File))
        return NextResponse.json({ error: "Choose a photo." }, { status: 400 });
      bytes = await normalizePhoto(file);
      const prompts = buildPrompts(inputs, []);
      const pipeline = await getPublishedPipeline(storageClient(), inputs.style);
      const pipelineResult = pipeline ? await runPipeline({ steps: pipeline.steps, image: bytes, ...inputs }) : null;
      const captions = pipelineResult?.captions ?? await generateCaptions({
          image: bytes,
          systemPrompt: prompts.system,
          userPrompt: prompts.user,
        });
      const model = pipelineResult?.steps.at(-1)?.model ?? geminiConfig().model;
      caption = captions[0];
      const photoPath = `${user.id}/${id}/admin-source-${randomUUID()}.jpg`;
      const upload = await storage.upload(photoPath, bytes, {
        contentType: "image/jpeg",
        upsert: false,
      });
      if (upload.error) throw new Error("Photo upload failed. Please retry.");
      uploaded.push(photoPath);
      payload = {
        ...inputs,
        status,
        captions,
        photo_path: photoPath,
        system_prompt: pipeline ? `Published pipeline ${pipeline.id}. Exact prompts and outputs are in settings.pipelineTrace.` : prompts.system,
        user_prompt: prompts.user,
        model,
        settings: { ...generationSettings(model), ...(pipelineResult ? { pipeline, pipelineInput: inputs, pipelineTrace: pipelineResult.steps } : {}) },
      };
    } else {
      const { data, error } = await client.rpc("admin_read", {
        p_kind: "media",
        p_id: id,
      });
      const media = (data as Collection<Media> | null)?.rows[0];
      if (error || !media)
        return NextResponse.json(
          { error: "Media no longer exists." },
          { status: 404 },
        );
      if (status === "published" && !media.selected_caption_id)
        return NextResponse.json(
          {
            error:
              "This draft has no AI captions. Create a new generated media item to publish.",
          },
          { status: 400 },
        );
      caption = String(form.get("caption") ?? "").trim();
      if (!caption || caption.length > 240)
        return NextResponse.json(
          { error: "Use a caption between 1 and 240 characters." },
          { status: 400 },
        );
      const download = await storage.download(media.photo_path);
      if (download.error || !download.data)
        throw new Error("The original photo could not be loaded.");
      bytes = Buffer.from(await download.data.arrayBuffer());
      owner = media.creator_id;
      oldRender = media.rendered_path;
      payload = {
        ...inputs,
        status,
        caption,
        ...(form.has("selected_caption_id") ? { selected_caption_id: form.get("selected_caption_id") } : {}),
        updated_at: form.get("updated_at"),
      };
    }
    const rendered = await renderMeme(bytes, caption),
      renderedPath = `${owner}/${id}/admin-render-${randomUUID()}.jpg`;
    const imageUpload = await storage.upload(renderedPath, rendered, {
      contentType: "image/jpeg",
      upsert: false,
    });
    if (imageUpload.error)
      throw new Error("The rendered image could not be saved.");
    uploaded.push(renderedPath);
    payload.rendered_path = renderedPath;
    // The RPC repeats role/session checks and commits media + provenance + audit atomically.
    const saved = await client.rpc("admin_media", {
      p_action: action,
      p_id: id,
      p_data: payload,
    });
    if (saved.error)
      throw new Error(
        saved.error.code === "40001"
          ? "Media changed in another tab. Reload before saving."
          : "Media could not be saved. Reload and try again.",
      );
    uploaded = [];
    if (oldRender) await storage.remove([oldRender]);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    if (uploaded.length) {
      try {
        await storageClient().storage.from(bucket).remove(uploaded);
      } catch {
        /* Preserve the original error. */
      }
    }
    const message = e instanceof Error ? e.message : "Media operation failed.";
    return NextResponse.json(
      { error: message },
      { status: e instanceof AccessError ? e.status : 400 },
    );
  }
}
