import { notFound } from "next/navigation";
import { requireAdmin } from "../../../../lib/auth";
import { isUuid } from "../../../../lib/caption-input";
import type { PipelineDraft } from "../../../../lib/pipelines";
import { pipelineModelOptions } from "../../../../lib/pipeline-models";
import PipelineEditor from "../../../components/pipeline-editor";
import { PageHeading } from "../../../components/ui";

export const metadata = { title: "Edit pipeline | Quip Control" };

export default async function PipelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id !== "new" && !isUuid(id)) notFound();
  const { client } = await requireAdmin();
  const models = await pipelineModelOptions(client);
  let draft: PipelineDraft | undefined;
  if (id !== "new") {
    const { data, error } = await client.rpc("admin_pipeline_read", { p_id: id });
    if (error) throw new Error("This pipeline could not be loaded. Please retry.");
    draft = data?.rows?.[0] as PipelineDraft | undefined;
    if (!draft) notFound();
  }
  return <>
    <PageHeading eyebrow="PIPELINE STUDIO" title={draft?.name ?? "Create pipeline"} description="Build instructions you can inspect, test and publish with confidence." />
    <PipelineEditor key={id} initialDraft={draft} models={models} />
  </>;
}
