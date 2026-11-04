export const pipelineSections = [
  { label: "Build", links: [["pipelines", "Pipelines"], ["prompt_chains", "Source chains"], ["prompt_chain_steps", "Steps"], ["prompt_chain_mix", "Saved mix"]] },
  { label: "Resources", links: [["terms", "Terms"], ["ai_generation_examples", "Examples"], ["llm_models", "Models"], ["llm_providers", "Providers"]] },
  { label: "History", links: [["generation_requests", "Requests"], ["llm_responses", "Responses"]] },
  { label: "Access", links: [["allowed_signup_domains", "Signup domains"], ["whitelisted_emails", "Email whitelist"]] },
] as const;

export function isPipelineCatalog(kind: string) {
  return pipelineSections.some((section) => section.links.some(([key]) => key === kind));
}

export function isPipelinePath(path: string) {
  return path === "/pipelines" || path.startsWith("/pipelines/") ||
    (path.startsWith("/catalog/") && isPipelineCatalog(path.split("/")[2]));
}
