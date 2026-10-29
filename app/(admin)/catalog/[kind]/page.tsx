import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "../../../../lib/auth";
import { getCatalog } from "../../../../lib/catalog";
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
type Row = Record<string, unknown> & { id: string; version?: number };
function label(key: string) {
  return key.replaceAll("_", " ").replace(/^./, (s) => s.toUpperCase());
}
function value(key: string, v: unknown) {
  if (v === null || v === undefined) return <span className="subtle">—</span>;
  if (typeof v === "boolean")
    return (
      <Badge tone={v ? "green" : "neutral"}>{v ? "Enabled" : "Disabled"}</Badge>
    );
  if (typeof v === "object")
    return <pre className="record-json">{JSON.stringify(v, null, 2)}</pre>;
  const targets: Record<string, string> = {
    chain_id: "/catalog/prompt_chains?q=",
    provider_id: "/catalog/llm_providers?q=",
    run_id: "/catalog/llm_responses?q=",
    generation_run_id: "/catalog/llm_responses?q=",
    moment_id: "/media/",
  };
  if (targets[key])
    return (
      <Link
        className="text-link"
        href={targets[key] + encodeURIComponent(String(v))}
      >
        {String(v)}
      </Link>
    );
  return String(v);
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
        eyebrow="OBSERVABILITY & CONFIGURATION"
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
                    <th key={k}>{kind === "prompt_chain_mix" && k === "enabled" ? "Included in saved mix" : kind === "prompt_chain_mix" && k === "weight" ? "Saved weight" : label(k)}</th>
                  ))}
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((row) => (
                  <tr key={row.id}>
                    {spec.columns.map((k) => (
                      <td key={k}>
                        <div className="catalog-cell">{value(k, row[k])}</div>
                      </td>
                    ))}
                    <td>
                      <details className="record-details">
                        <summary>
                          {spec.detailAction ?? (spec.mode !== "read" ? "View / edit" : "View details")}
                        </summary>
                        <div className="record-body">
                          <dl>
                            {Object.entries(row).map(([k, v]) => (
                              <div key={k}>
                                <dt>{label(k)}</dt>
                                <dd>{value(k, v)}</dd>
                              </div>
                            ))}
                          </dl>
                          {kind === "prompt_chains" && (
                            <Link
                              className="text-link"
                              href={`/catalog/prompt_chain_steps?q=${row.id}`}
                            >
                              Read this chain’s step prompts →
                            </Link>
                          )}
                          {spec.mode !== "read" && (
                            <CatalogForm
                              key={`${row.id}-${row.version}`}
                              kind={kind}
                              record={row}
                            />
                          )}
                        </div>
                      </details>
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
