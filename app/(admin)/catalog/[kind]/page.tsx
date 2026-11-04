import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "../../../../lib/auth";
import { getCatalog } from "../../../../lib/catalog";
import { isPipelineCatalog } from "../../../../lib/pipeline-navigation";
import { pageNumber, type Collection } from "../../../../lib/data";
import {
  PageHeading,
  Search,
  Pagination,
  Empty,
  Badge,
} from "../../../components/ui";
import CatalogForm from "../../../components/catalog-form";
import PipelineGuide from "../../../components/pipeline-guide";
import CatalogRecordActions, { CatalogValue } from "../../../components/catalog-record-actions";
import "../../../catalog-refinement.css";
type Row = Record<string, unknown> & { id: string; version?: number };
function label(key: string) {
  return key.replaceAll("_", " ").replace(/^./, (s) => s.toUpperCase());
}
export default async function CatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { kind } = await params,
    spec = getCatalog(kind);
  if (!spec) notFound();
  const s = await searchParams,
    q = (s.q ?? "").slice(0, 100),
    { client } = await requireAdmin();
  const { data, error } = await client.rpc("admin_catalog_read", {
    p_kind: kind,
    p_query: q,
    p_page: pageNumber(s.page),
  });
  if (error)
    throw new Error("This collection could not be loaded. Please retry.");
  const d = data as Collection<Row>;
  return (
    <>
      <PageHeading
        eyebrow={isPipelineCatalog(kind) ? "PIPELINE STUDIO" : "ACCESS CONFIGURATION"}
        title={spec.title}
        description={spec.description}
      >
        <Badge>{d.total} records</Badge>
      </PageHeading>
      <PipelineGuide kind={kind} />
      {kind === "llm_models" && (
        <p className="collection-note">
          <Link className="text-link" href="/catalog/llm_providers">
            Browse providers and copy a provider record ID →
          </Link>
        </p>
      )}
      {spec.mode === "crud" && (
        <details className="panel catalog-create">
          <summary>{kind === "ai_generation_examples" ? "Add reference example" : `Create ${spec.title.toLowerCase()} record`}</summary>
          <CatalogForm kind={kind} />
        </details>
      )}
      <Search query={q} placeholder="Search record text or ID" />
      <section className="panel table-panel">
        {!d.rows.length ? (
          <Empty title={q ? "No matching records" : "No records yet"}>
            {q
              ? "Try a different search."
              : spec.mode === "crud"
                ? "Create the first record using the form above."
                : "Records will appear here when this pipeline has saved data."}
          </Empty>
        ) : (
          <div className="table-scroll">
            <table className="catalog-table">
              <thead>
                <tr>
                  {spec.columns.map((k) => (
                    <th key={k}>{kind === "prompt_chain_mix" && k === "enabled" ? "Included in saved mix" : kind === "prompt_chain_mix" && k === "weight" ? "Saved weight" : kind === "ai_generation_examples" && k === "output" ? "Expected output" : label(k)}</th>
                  ))}
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((row) => (
                  <tr key={row.id}>
                    {spec.columns.map((k) => (
                      <td key={k}>
                        <div className="catalog-cell"><CatalogValue name={k} value={row[k]} /></div>
                      </td>
                    ))}
                    <td>
                      <CatalogRecordActions key={`${row.id}-${row.version}`} kind={kind} record={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={d.page} total={d.total} query={q} />
      </section>
      <p className="collection-note">
        {spec.mode === "read"
          ? "Read-only collection. Original records are preserved."
          : "Changes require current superadmin access. Reload before editing a record changed in another tab."}
      </p>
    </>
  );
}
