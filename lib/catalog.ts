export type Field = {
  key: string;
  label: string;
  type?: "text" | "textarea" | "number" | "checkbox" | "email" | "url";
  max?: number;
  optional?: boolean;
  hint?: string;
};
export type Catalog = {
  title: string;
  description: string;
  mode: "read" | "edit" | "crud";
  columns: string[];
  fields: Field[];
  detailAction?: string;
  saveAction?: string;
  savedMessage?: string;
};
export const catalogs: Record<string, Catalog> = {
  prompt_chains: {
    title: "Prompt chains",
    description:
      "A chain is a caption pipeline: a named set of instructions sent to an AI model. Choose a chain to inspect its version and ordered steps.",
    detailAction: "Inspect chain",
    mode: "read",
    columns: ["name", "prompt_version", "description"],
    fields: [],
  },
  prompt_chain_steps: {
    title: "Prompt chain steps",
    description:
      "Each step is one stage of a chain. Read the system prompt (the model’s rules) and user prompt (the task and input) in execution order. These saved templates are read-only here.",
    detailAction: "Read step prompts",
    mode: "read",
    columns: ["name", "position", "chain_id"],
    fields: [],
  },
  prompt_chain_mix: {
    title: "Prompt chain mix",
    description:
      "Save a chain’s weight and inclusion in the mix. These settings are not connected to live caption generation yet.",
    detailAction: "Edit mix settings",
    saveAction: "Save mix settings",
    savedMessage: "Mix settings saved. Live caption generation is unchanged.",
    mode: "edit",
    columns: ["chain_id", "weight", "enabled"],
    fields: [
      { key: "weight", label: "Saved weight (0–100)", type: "number", max: 100,
        hint: "A configuration value for this chain, not a live traffic percentage. Changing it does not change how often Quip runs this chain." },
      { key: "enabled", label: "Include in saved mix", type: "checkbox",
        hint: "Records whether this chain is included in the saved mix. Turning it off does not disable live caption generation." },
    ],
  },
  terms: {
    title: "Terms",
    description: "Maintain the vocabulary and definitions used by your team.",
    mode: "crud",
    columns: ["term", "definition"],
    fields: [
      { key: "term", label: "Term", max: 200 },
      { key: "definition", label: "Definition", type: "textarea", max: 10000 },
    ],
  },
  generation_requests: {
    title: "Generation requests",
    description:
      "Trace a caption-generation attempt: its status, errors, prompts and model settings. Use this history to understand what actually ran.",
    detailAction: "Inspect generation request",
    mode: "read",
    columns: ["state", "model", "style", "created_at"],
    fields: [],
  },
  llm_responses: {
    title: "LLM responses",
    description:
      "Saved caption outputs with the original prompts, model and generation provenance. Raw provider payloads were not retained by the original pipeline.",
    detailAction: "Read prompts & captions",
    mode: "read",
    columns: ["model", "provider", "style", "created_at"],
    fields: [],
  },
  ai_generation_examples: {
    title: "AI generation examples",
    description:
      "Save sample inputs and ideal outputs as a reference for evaluating prompts. Saving an example does not train a model or run a generation.",
    detailAction: "Review / edit example",
    saveAction: "Save example",
    savedMessage: "Example saved for reference. No generation was run.",
    mode: "crud",
    columns: ["input", "output", "notes"],
    fields: [
      { key: "input", label: "Input", type: "textarea", max: 20000 },
      { key: "output", label: "Expected output", type: "textarea", max: 20000 },
      {
        key: "notes",
        label: "Notes",
        type: "textarea",
        max: 10000,
        optional: true,
      },
    ],
  },
  llm_models: {
    title: "LLM models",
    description:
      "Maintain the model catalog. Runtime model selection remains controlled by the app’s deployment configuration.",
    mode: "crud",
    columns: ["name", "model_id", "provider_id", "enabled"],
    fields: [
      { key: "name", label: "Display name", max: 120 },
      { key: "model_id", label: "Provider model ID", max: 200 },
      {
        key: "provider_id",
        label: "Provider record ID",
        max: 36,
        hint: "Copy the record ID from LLM providers. Providers in use cannot be deleted.",
      },
      { key: "enabled", label: "Enabled", type: "checkbox" },
    ],
  },
  llm_providers: {
    title: "LLM providers",
    description:
      "Manage provider names and API base URLs. Credentials stay in deployment secrets, never in this catalog.",
    mode: "crud",
    columns: ["name", "api_base_url"],
    fields: [
      { key: "name", label: "Provider name", max: 120 },
      {
        key: "api_base_url",
        label: "HTTPS API base URL",
        type: "url",
        max: 2000,
      },
    ],
  },
  allowed_signup_domains: {
    title: "Allowed signup domains",
    description:
      "Maintain the signup-domain allowlist. These records do not grant admin privileges or alter the current Google OAuth signup policy.",
    mode: "crud",
    columns: ["domain", "created_at"],
    fields: [
      {
        key: "domain",
        label: "Domain",
        max: 253,
        hint: "Enter a domain such as columbia.edu, without https:// or @.",
      },
    ],
  },
  whitelisted_emails: {
    title: "Whitelisted email addresses",
    description:
      "Maintain individual signup exceptions. These records do not grant admin privileges or alter the current Google OAuth signup policy.",
    mode: "crud",
    columns: ["email", "created_at"],
    fields: [{ key: "email", label: "Email address", type: "email", max: 254 }],
  },
};
export function getCatalog(kind: string): Catalog | undefined {
  return Object.hasOwn(catalogs, kind) ? catalogs[kind] : undefined;
}
export function parseCatalogInput(
  kind: string,
  action: unknown,
  value: unknown,
) {
  const spec = getCatalog(kind);
  if (
    !spec ||
    spec.mode === "read" ||
    !["create", "update", "delete"].includes(String(action)) ||
    (spec.mode === "edit" && action !== "update")
  )
    throw new Error("This operation is not allowed.");
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid record.");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((k) => !spec.fields.some((f) => f.key === k)))
    throw new Error("Unknown field.");
  if (action === "delete") return {};
  const result: Record<string, string | boolean | number> = {};
  for (const f of spec.fields) {
    const raw = input[f.key];
    if (f.type === "checkbox") {
      if (typeof raw !== "boolean")
        throw new Error(`${f.label} must be on or off.`);
      result[f.key] = raw;
      continue;
    }
    if (f.type === "number") {
      if (
        typeof raw !== "number" ||
        !Number.isFinite(raw) ||
        raw < 0 ||
        raw > (f.max ?? 100)
      )
        throw new Error(`${f.label} is out of range.`);
      result[f.key] = raw;
      continue;
    }
    if (typeof raw !== "string") throw new Error(`${f.label} must be text.`);
    let text = raw.trim();
    if (["email", "domain"].includes(f.key)) text = text.toLowerCase();
    if ((!f.optional && !text) || text.length > (f.max ?? 20000))
      throw new Error(`Check ${f.label.toLowerCase()} and its length.`);
    if (f.type === "url" && !/^https:\/\/[^\s]+$/.test(text))
      throw new Error("Enter an HTTPS URL.");
    if (f.type === "email" && !/^[^\s@]+@[^\s@]+\.[a-z]{2,63}$/.test(text))
      throw new Error("Enter a valid email address.");
    if (
      f.key === "domain" &&
      !/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(text)
    )
      throw new Error("Enter a domain without a URL or @.");
    if (
      f.key === "provider_id" &&
      !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(text)
    )
      throw new Error("Enter the provider’s record ID.");
    result[f.key] = text;
  }
  return result;
}
