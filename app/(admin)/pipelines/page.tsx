import Link from "next/link";
import { requireAdmin } from "../../../lib/auth";
import type { PipelineDraft } from "../../../lib/pipelines";
import { PageHeading, Empty, Badge } from "../../components/ui";

export const metadata = { title: "Pipeline studio | Quip Control" };

export default async function PipelinesPage() {
  const { client } = await requireAdmin();
  const { data, error } = await client.rpc("admin_pipeline_read", { p_id: null });
  if (error) throw new Error("Pipelines could not be loaded. Please retry.");
  const rows = (data?.rows ?? []) as PipelineDraft[];
  return (
    <>
      <PageHeading eyebrow="PROMPT DEVELOPMENT" title="Pipeline studio" description="Create a draft, test it on an image, then publish it for one caption style. You decide when changes go live.">
        <Link className="button primary" href="/pipelines/new">Create pipeline</Link>
      </PageHeading>
      <div className="pipeline-impact pipeline-list-intro"><strong>One live pipeline per style.</strong> Publishing replaces that style’s active pipeline. Draft edits never change a published snapshot. Styles without a published pipeline use Quip’s built-in prompts.</div>
      {rows.length ? <div className="pipeline-card-grid">{rows.map((draft) => {
        const ownRelease = draft.active_release?.pipeline_id === draft.id;
        const current = ownRelease && draft.active_release?.draft_version === draft.version;
        return <article className="panel pipeline-list-card" key={draft.id}>
          <div className="pipeline-toolbar"><Badge tone={current ? "green" : "purple"}>{current ? "Published" : ownRelease ? "Unpublished changes" : "Draft"}</Badge><span>{draft.style}</span></div>
          <h2>{draft.name}</h2>
          <p>{draft.description || "No purpose added yet."}</p>
          <p className="pipeline-list-meta">Revision {draft.version} · {draft.steps.length} step{draft.steps.length === 1 ? "" : "s"}</p>
          {ownRelease && !current && <p className="pipeline-list-meta">Live revision {draft.active_release?.draft_version} is unchanged.</p>}
          <Link className="text-link" href={`/pipelines/${draft.id}`}>Open pipeline →</Link>
        </article>;
      })}</div> : <section className="panel"><Empty title="Your first pipeline starts as a draft">Start with one caption-writing step, or add image analysis before it. <Link className="text-link" href="/pipelines/new">Create pipeline →</Link></Empty></section>}
      <p className="collection-note"><Link className="text-link" href="/catalog/prompt_chains">Inspect the original source prompt catalog →</Link></p>
    </>
  );
}
