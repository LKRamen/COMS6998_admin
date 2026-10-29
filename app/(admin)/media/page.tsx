/* eslint-disable @next/next/no-img-element -- Private images require the viewer's session cookies. */
import Link from "next/link";
import {
  date,
  pageNumber,
  type Collection,
  type Media,
} from "../../../lib/data";
import {
  PageHeading,
  Pagination,
  Empty,
  Badge,
} from "../../components/ui";
import { requireAdmin } from "../../../lib/auth";
import { mediaFilters, mediaSorts } from "../../../lib/media-filters";
export const metadata = { title: "Media library" };
export default async function Library({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const s = await searchParams, filters = mediaFilters(s);
  const { client } = await requireAdmin();
  const { data, error } = await client.rpc('admin_media_library', {
    p_query: filters.q, p_page: pageNumber(typeof s.page === 'string' ? s.page : undefined),
    p_style: filters.style, p_status: filters.status, p_reactions: filters.reactions, p_sort: filters.sort,
  });
  if (error) throw new Error('The media library could not be loaded. Please retry.');
  const d = data as Collection<Media> & { styles: string[] };
  return (
    <>
      <PageHeading
        eyebrow="ALL THE GOOD STUFF. AND THE DRAFTS."
        title="The media library."
        description="Review, create, and manage every AI-captioned moment."
      >
        <Link className="button primary" href="/media/new">
          ＋ Create media
        </Link>
      </PageHeading>
      <form className="media-filters panel" role="search" action="/media">
        <label className="media-filter-search">Search media
          <input name="q" defaultValue={filters.q} placeholder="Caption, context, creator, or ID" maxLength={100} />
        </label>
        <label>Humor type<select name="style" defaultValue={filters.style}>
          <option value="">All humor types</option>
          {Array.from(new Set([...d.styles, ...(filters.style ? [filters.style] : [])])).map(style => <option key={style} value={style}>{style}</option>)}
        </select></label>
        <label>Status<select name="status" defaultValue={filters.status}>
          <option value="">Drafts and published</option><option value="published">Published</option><option value="draft">Drafts</option>
        </select></label>
        <label>Reactions<select name="reactions" defaultValue={filters.reactions}>
          <option value="">All media</option><option value="rated">Has reactions</option><option value="unrated">No reactions</option>
        </select></label>
        <label>Sort by<select name="sort" defaultValue={filters.sort}>
          {Object.entries(mediaSorts).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <div className="media-filter-actions"><button className="button primary" type="submit">Apply filters</button><Link href="/media">Reset</Link></div>
      </form>
      <div className="collection-meta">
        <b>{d.total} media items</b>
        <span>{mediaSorts[filters.sort]} · {filters.style || 'All humor types'} · {filters.status || 'Drafts and published'}</span>
      </div>
      {!d.rows.length ? (
        <section className="panel">
          <Empty title="No media found">
            Try another search or <Link href="/media">reset your filters</Link>.
          </Empty>
        </section>
      ) : (
        <div className="media-grid">
          {d.rows.map((m) => (
            <Link href={`/media/${m.id}`} className="media-card" key={m.id}>
              <div className="media-image">
                {/* Authenticated image endpoint keeps private originals behind the same wall. */}
                <img
                  src={`/api/image/${m.id}?v=${encodeURIComponent(m.updated_at)}`}
                  alt={m.caption || "Media awaiting a caption"}
                  loading="lazy"
                />
                <Badge tone={m.status === "published" ? "green" : "neutral"}>
                  {m.status}
                </Badge>
              </div>
              <div className="media-content">
                <span className="media-style">{m.style}</span>
                <h2>{m.caption || "Untitled draft"}</h2>
                <p>
                  @{m.username ?? "creator"} <span>· {date(m.created_at)}</span>
                </p>
                <div className="media-footer">
                  <span>
                    ↑ {m.upvotes} <span>↓ {m.downvotes}</span>
                  </span>
                  <b>Manage ↗</b>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
      <Pagination page={d.page} total={d.total} filters={filters} />
    </>
  );
}
