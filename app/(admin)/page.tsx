import Link from "next/link";
import { read, date, type Overview } from "../../lib/data";
import { PageHeading, Empty, Badge } from "../components/ui";
export default async function OverviewPage() {
  const d = await read<Overview>("overview"),
    approval = d.votes ? Math.round((d.upvotes / d.votes) * 100) : 0,
    max = Math.max(1, ...d.activity.flatMap((a) => [a.media, a.votes]));
  return (
    <>
      <PageHeading
        eyebrow="YOUR COMMUNITY, AT A GLANCE"
        title="The bright side of oversight."
        description="The pulse of your community, from first draft to final reaction."
      >
        <Link className="button primary" href="/media/new">
          ＋ Create media
        </Link>
      </PageHeading>
      <div className="overview-note">
        <span className="live-dot" /> Live database snapshot <span>·</span>{" "}
        Updates automatically{" "}
        <Link href="/media">Explore the library ↗</Link>
      </div>
      <section className="stats" aria-label="Community statistics">
        {[
          ["Community", d.profiles, "Google-connected profiles", "♙", "/users"],
          [
            "Media library",
            d.media,
            `${d.published} published · ${d.drafts} drafts`,
            "▧",
            "/media",
          ],
          [
            "Total reactions",
            d.votes,
            `${d.upvotes} up · ${d.downvotes} down`,
            "↕",
            "/ratings",
          ],
          [
            "Approval rate",
            d.votes ? `${approval}%` : "—",
            d.votes
              ? "Share of all votes that are upvotes"
              : "Waiting for the first vote",
            "thumbs-up",
            "/ratings",
          ],
        ].map(([label, value, note, icon, href]) => (
          <Link className="stat stat-link" key={String(label)} href={String(href)}>
            <div>
              {label}
              <span aria-hidden="true">{icon === "thumbs-up" ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" focusable="false">
                  <path d="M7 10v11H3V10h4Zm0 0 5-7a2 2 0 0 1 2 2v4h5a2 2 0 0 1 2 2.4l-1.4 7A3 3 0 0 1 16.7 21H7" />
                </svg>
              ) : icon}</span>
            </div>
            <strong>{value}</strong>
            <small>{note}</small>
          </Link>
        ))}
      </section>
      <div className="dashboard-grid">
        <section className="panel activity-panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">THE DAILY DOSE</span>
              <h2>Made it. Rated it.</h2>
            </div>
            <span className="subtle">Last 14 days · UTC</span>
          </div>
          <div className="chart-legend">
            <span>
              <i className="purple" />
              Media created
            </span>
            <span>
              <i className="lime" />
              Votes cast
            </span>
          </div>
          <div
            className="bar-chart"
            role="img"
            aria-label={`Daily media and votes over the past 14 days. ${d.activity.map((a) => `${a.day}: ${a.media} media, ${a.votes} votes`).join("; ")}`}
          >
            {d.activity.map((a, i) => (
              <div className="chart-day" key={a.day}>
                <div
                  className="bar-pair"
                  title={`${a.day}: ${a.media} media · ${a.votes} votes`}
                >
                  <i
                    style={{ height: `${Math.max(1, (a.media / max) * 100)}%` }}
                  />
                  <i
                    style={{ height: `${Math.max(1, (a.votes / max) * 100)}%` }}
                  />
                </div>
                <small>
                  {i % 3 === 0
                    ? new Date(a.day).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        timeZone: "UTC",
                      })
                    : ""}
                </small>
              </div>
            ))}
          </div>
          <div className="chart-bottom">
            <span>Creation is only half the story.</span>
            <b>{d.generations} AI generation runs, all time</b>
          </div>
        </section>
        <section className="spotlight">
          <span className="eyebrow">WAITING FOR A VERDICT</span>
          <div className="spotlight-number">
            {d.unrated}
            <Link href="/media?status=published&reactions=unrated" className="spotlight-arrow" aria-label="Open the media library to review memes without a reaction">
              <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <h2>
            Memes without
            <br />a reaction.
          </h2>
          <p>
            {d.published
              ? `${Math.round((d.unrated / d.published) * 100)}% of published media hasn’t been rated yet. A fresh audience could change that.`
              : "Publish your first meme to get the conversation started."}
          </p>
          <Link href="/media">
            See the media library <span>→</span>
          </Link>
          <div className="spotlight-ring" aria-hidden="true" />
        </section>
      </div>
      <div className="dashboard-grid lower">
        <section className="panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">THE PEOPLE HAVE SPOKEN</span>
              <h2>Community favorites</h2>
            </div>
            <Link href="/ratings" className="text-link">
              All votes ↗
            </Link>
          </div>
          {!d.top.length ? (
            <Empty title="No published media yet" />
          ) : (
            <div className="leaderboard">
              {d.top.map((m, i) => (
                <Link href={`/media/${m.id}`} className="leader-row" key={m.id}>
                  <span className="rank">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <b>{m.caption}</b>
                    <small>
                      @{m.username ?? "creator"} · {m.votes} reactions
                    </small>
                  </div>
                  <Badge tone={m.score >= 0 ? "green" : "red"}>
                    {m.score > 0 ? "+" : ""}
                    {m.score}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </section>
        <section className="panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">FINDING THE FUNNY</span>
              <h2>Style check</h2>
            </div>
          </div>
          <p className="panel-description">
            Media count and approval by humor style.
          </p>
          <div className="style-list">
            {d.styles.map((s) => (
              <div className="style-row" key={s.style}>
                <div>
                  <b>{s.style}</b>
                  <small>
                    {s.total} media · {s.votes} votes
                  </small>
                </div>
                <div className="mini-meter">
                  <span
                    style={{
                      width: `${s.votes ? (s.upvotes / s.votes) * 100 : 0}%`,
                    }}
                  />
                </div>
                <b>
                  {s.votes
                    ? `${Math.round((s.upvotes / s.votes) * 100)}%`
                    : "—"}
                </b>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="panel audit">
        <div className="panel-title">
          <div>
            <span className="eyebrow">A PAPER TRAIL FOR THE CHAOS</span>
            <h2>Recent admin activity</h2>
          </div>
          <Badge>Audited changes</Badge>
        </div>
        {d.audit.length ? (
          <div className="audit-list">
            {d.audit.map((a, i) => (
              <div key={i}>
                <span className="audit-dot" />
                <b>{a.display_name || "Superadmin"}</b>
                <span>
                  {a.action === "create"
                    ? "created"
                    : a.action === "update"
                      ? "updated"
                      : "deleted"}{" "}
                  media
                </span>
                <code>{a.media_id.slice(0, 8)}</code>
                <small>{date(a.created_at)}</small>
              </div>
            ))}
          </div>
        ) : (
          <p className="panel-description">
            Admin media changes will appear here. No changes recorded yet.
          </p>
        )}
      </section>
    </>
  );
}
