/* eslint-disable @next/next/no-img-element -- Private images require the viewer's session cookies. */
import Link from "next/link";
import {
  read,
  date,
  pageNumber,
  type Collection,
  type Media,
} from "../../../lib/data";
import {
  PageHeading,
  Search,
  Pagination,
  Empty,
  Badge,
} from "../../components/ui";
export const metadata = { title: "Media library" };
export default async function Library({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const s = await searchParams,
    q = s.q ?? "",
    d = await read<Collection<Media>>("media", q, pageNumber(s.page));
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
      <Search
        query={q}
        placeholder="Search captions, context, style, creator, or ID"
      />
      <div className="collection-meta">
        <b>{d.total} media items</b>
        <span>Newest first · Drafts and published</span>
      </div>
      {!d.rows.length ? (
        <section className="panel">
          <Empty title="No media found">
            <Link href="/media/new">Create an AI-captioned meme</Link> or try
            another search.
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
      <Pagination page={d.page} total={d.total} query={q} />
    </>
  );
}
