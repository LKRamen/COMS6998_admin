import Link from "next/link";

const destinations = [
  ["prompt_chains", "Inspect chains", "Which pipeline and version?"],
  ["prompt_chain_steps", "Read step prompts", "What instructions does it contain?"],
  ["prompt_chain_mix", "Configure saved mix", "Which weights and inclusions are saved?"],
  ["generation_requests", "Trace requests", "What ran, and did it succeed?"],
  ["llm_responses", "Review captions", "What did the model produce?"],
];

export default function PipelineGuide({ kind }: { kind: string }) {
  if (!destinations.some(([key]) => key === kind) && kind !== "ai_generation_examples") return null;
  return (
    <section className="panel pipeline-guide" aria-labelledby="pipeline-guide-title">
      <h2 id="pipeline-guide-title">Find your way around the pipeline</h2>
      <p>Inspect the instructions, manage saved configuration, then review actual generation history.</p>
      <nav aria-label="Prompt pipeline sections">
        {destinations.map(([key, title, description]) => (
          <Link key={key} href={`/catalog/${key}`} aria-current={key === kind ? "page" : undefined}>
            <strong>{title}</strong>
            <span>{description}</span>
          </Link>
        ))}
      </nav>
      <p className="pipeline-impact"><strong>Live generation:</strong> Quip currently uses prompts defined in the app and the user’s selected style. Saving mix settings or examples here does not publish changes to that pipeline.</p>
    </section>
  );
}
