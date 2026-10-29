import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModelOption } from "./pipelines";
export async function pipelineModelOptions(client: SupabaseClient): Promise<ModelOption[]> {
  const options: ModelOption[] = [{ value: "default", label: `Deployment default${process.env.GEMINI_MODEL ? ` (${process.env.GEMINI_MODEL})` : ""}` }];
  // Model identifiers may be catalogued; credentials and API hosts are never user-configurable here.
  for (let page = 0; page < 100; page++) {
    const { data, error } = await client.rpc("admin_catalog_read", { p_kind: "llm_models", p_query: "gemini-", p_page: page });
    if (error) throw new Error("Model choices could not be loaded.");
    for (const row of data.rows) if (row.enabled && /^gemini-[a-zA-Z0-9._-]{1,100}$/.test(row.model_id) && !options.some(o => o.value === row.model_id)) options.push({ value: row.model_id, label: `${row.name} (${row.model_id})` });
    if ((page + 1) * 24 >= data.total) break;
  }
  return options;
}
