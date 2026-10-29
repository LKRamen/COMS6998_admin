import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "./caption-input";
import { parsePipeline, type PipelineRelease } from "./pipelines";
import { GenerationError } from "./generation-error";

type AdminClient = SupabaseClient;

/** Validate persisted snapshots before using any model or prompt in a provider request. */
export function readPipelineSnapshot(value: unknown, style: string): PipelineRelease {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    const row = value as Record<string, unknown>;
    const pipeline = parsePipeline({ name: row.name, description: row.description ?? "", style: row.style, steps: row.steps });
    if (!isUuid(row.id) || !isUuid(row.pipeline_id) || !Number.isInteger(row.draft_version) || Number(row.draft_version) < 1 ||
        pipeline.style !== style || pipeline.steps.some(step => !/^gemini-[a-zA-Z0-9._-]+$/.test(step.model))) throw new Error();
    return { ...pipeline, id: row.id, pipeline_id: row.pipeline_id, draft_version: Number(row.draft_version) };
  } catch {
    throw new GenerationError("The published pipeline is invalid. Your draft is saved; ask an administrator to review this style.");
  }
}

/** Called only after the caller's draft ownership check, using the server's service client. */
export async function getPublishedPipeline(admin: AdminClient, style: string): Promise<PipelineRelease | null> {
  const { data, error } = await admin.from("pipeline_active").select("release:pipeline_releases(*)").eq("style", style).maybeSingle();
  if (error) throw new GenerationError("Published pipeline could not be loaded. Your draft is saved; try again shortly.");
  if (!data) return null;
  return readPipelineSnapshot(data.release, style);
}
