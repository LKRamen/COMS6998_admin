"use client";

import { useEffect, useRef, useState } from "react";
import { sampleDataset, samplePeriod, type SampleMedia } from "../../lib/sample-data";

type Tab = "Media" | "Community" | "Votes" | "Generation runs";
type Selection = { kind: "media" | "profile" | "run"; id: string } | null;
const day = (value: string) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const percent = (value: number | null) => value === null ? "—" : `${Math.round(value)}%`;

function Illustration({ media }: { media: SampleMedia }) {
  return <div className={`sample-art sample-art-${media.style}`} aria-label="Illustrative sample artwork">
    <span className="sample-art-label">ILLUSTRATIVE SAMPLE</span>
    <div className="sample-desk" aria-hidden="true"><i className="sample-screen" /><i className="sample-mug" /><i className="sample-note" /></div>
    <p>{media.caption}</p>
  </div>;
}

export default function SampleWorkspace() {
  const d = sampleDataset;
  const [tab, setTab] = useState<Tab>("Media");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState("all");
  const [selection, setSelection] = useState<Selection>(null);
  const detail = useRef<HTMLElement>(null);
  const q = query.trim().toLowerCase();
  const matches = (...values: (string | number | null)[]) => values.some(value => String(value ?? "").toLowerCase().includes(q));
  const person = (id: string) => d.profiles.find(p => p.id === id)!;
  const mediaById = (id: string) => d.media.find(m => m.id === id)!;
  const changeTab = (next: Tab) => { setTab(next); setPage(0); setQuery(""); setFilter("all"); setSelection(null); };
  const inspect = (kind: NonNullable<Selection>["kind"], id: string) => setSelection({ kind, id });
  const viewVotes = (id: string) => { changeTab("Votes"); setQuery(id); };
  useEffect(() => { if (selection) { detail.current?.focus({ preventScroll: true }); detail.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" }); } }, [selection]);
  const media = d.media.filter(m => matches(m.id, m.caption, m.context, person(m.profileId).name, person(m.profileId).username) && (filter === "all" || m.style === filter || m.status === filter));
  const profiles = d.profiles.filter(p => matches(p.name, p.username, p.email, p.id));
  const votes = d.votes.filter(v => matches(v.id, v.mediaId, person(v.profileId).name, person(v.profileId).username, mediaById(v.mediaId).caption) && (filter === "all" || String(v.value) === filter));
  const runs = d.runs.filter(r => matches(r.id, r.mediaId, r.model, r.input, r.error) && (filter === "all" || r.status === filter));
  const selectedMedia = selection?.kind === "media" ? d.media.find(m => m.id === selection.id) : null;
  const selectedProfile = selection?.kind === "profile" ? d.profiles.find(p => p.id === selection.id) : null;
  const selectedRun = selection?.kind === "run" ? d.runs.find(r => r.id === selection.id) : null;
  const count = tab === "Media" ? media.length : tab === "Community" ? profiles.length : tab === "Votes" ? votes.length : runs.length;
  const max = Math.max(...d.activity.flatMap(a => [a.media, a.votes]), 1);

  return <div className="sample-workspace">
    <div className="sample-disclosure"><b>Sample data · fictional records · read-only</b><p>Explore a connected community, media library, vote ledger, and generation history. These records are invented for practice and are separate from your live database.</p></div>
    <section className="stats" aria-label="Sample dataset statistics">
      {[["Fictional profiles", d.summary.profiles, "Creators and voters"], ["Sample media", d.summary.media, `${d.summary.published} published · ${d.summary.drafts} drafts`], ["Sample votes", d.summary.votes, `${d.summary.upvotes} up · ${d.summary.downvotes} down`], ["Run success rate", percent(d.summary.succeeded / d.summary.runs * 100), `${d.summary.succeeded} succeeded · ${d.summary.failed} failed · ${d.summary.pending} pending`]].map(([label, value, note]) => <article className="stat" key={label}><div>{label}</div><strong>{value}</strong><small>{note}</small></article>)}
    </section>
    <div className="sample-analysis">
      <section className="panel"><div className="panel-title"><div><span className="eyebrow">A TWO-WEEK SNAPSHOT</span><h2>Creation meets reaction.</h2></div><small>{samplePeriod.label}</small></div>
        <div className="chart-legend"><span><i className="purple" /> Media created</span><span><i className="lime" /> Votes cast</span></div>
        <div className="bar-chart" role="img" aria-label={`Synthetic daily activity. ${d.activity.map(a => `${a.day}: ${a.media} media, ${a.votes} votes`).join("; ")}`}>
          {d.activity.map((a, i) => <div className="chart-day" key={a.day}><div className="bar-pair" title={`${a.day}: ${a.media} media · ${a.votes} votes`}><i style={{ height: `${a.media / max * 100}%` }} /><i style={{ height: `${a.votes / max * 100}%` }} /></div><small>{i % 3 === 0 ? day(a.day) : ""}</small></div>)}
        </div>
      </section>
      <section className="panel"><span className="eyebrow">COMPARE THE STYLES</span><h2>What lands?</h2><p className="sample-muted">Upvotes as a share of each style’s votes.</p><div className="sample-styles">{d.styles.map(s => <button key={s.style} onClick={() => { changeTab("Media"); setFilter(s.style); }}><span><b>{s.style}</b><small>{s.total} media · {s.votes} votes</small></span><span className="sample-meter"><i style={{ width: `${s.approvalRate ?? 0}%` }} /></span><strong>{percent(s.approvalRate)}</strong></button>)}</div></section>
    </div>
    <section className="panel sample-browser" aria-label="Explore sample records">
      <div className="sample-tabs" role="tablist" aria-label="Sample record types">{(["Media", "Community", "Votes", "Generation runs"] as Tab[]).map(t => <button key={t} role="tab" id={`sample-tab-${t.replaceAll(" ", "-")}`} aria-controls="sample-records" aria-selected={tab === t} onClick={() => changeTab(t)}>{t}<span>{t === "Media" ? d.media.length : t === "Community" ? d.profiles.length : t === "Votes" ? d.votes.length : d.runs.length}</span></button>)}</div>
      <div className="sample-filters"><label>Search {tab.toLowerCase()}<input value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} placeholder="Search records, people, or IDs" /></label>{tab !== "Community" && <label>Filter {tab.toLowerCase()}<select value={filter} onChange={e => { setFilter(e.target.value); setPage(0); }}><option value="all">All {tab.toLowerCase()}</option>{tab === "Media" ? <><optgroup label="Publication"><option value="published">Published</option><option value="draft">Drafts</option></optgroup><optgroup label="Style">{d.styles.map(s => <option key={s.style} value={s.style}>{s.style}</option>)}</optgroup></> : tab === "Votes" ? <><option value="1">Upvotes</option><option value="-1">Downvotes</option></> : <><option value="succeeded">Succeeded</option><option value="failed">Failed</option><option value="pending">Pending</option></>}</select></label>}<span role="status">{count} matching {count === 1 ? "record" : "records"}</span>{(query || filter !== "all") && <button className="text-button" onClick={() => { setQuery(""); setFilter("all"); setPage(0); }}>Clear filters</button>}</div>
      <div role="tabpanel" id="sample-records" aria-labelledby={`sample-tab-${tab.replaceAll(" ", "-")}`}>
        {!count && <div className="empty"><h3>No sample records match.</h3><p>Try another search or clear the filters.</p></div>}
        {tab === "Media" && <div className="sample-media-grid">{media.slice(page * 12, page * 12 + 12).map(m => <button className="sample-media-card" key={m.id} onClick={() => inspect("media", m.id)} aria-label={`Inspect media: ${m.caption}`}><Illustration media={m} /><span className="sample-card-meta"><b>@{person(m.profileId).username}</b><span className={`sample-status ${m.status}`}>{m.status}</span></span><span className="sample-card-bottom">{m.style} · {day(m.createdAt)}<b>↑ {m.upvotes} &nbsp; ↓ {m.downvotes}</b></span></button>)}</div>}
        {tab === "Community" && <div className="sample-table-wrap"><table><thead><tr><th>Fictional profile</th><th>Media</th><th>Votes</th><th>Joined</th><th>Details</th></tr></thead><tbody>{profiles.slice(page * 12, page * 12 + 12).map(p => <tr key={p.id}><td><b>{p.name}</b><small>@{p.username} · {p.email}</small></td><td>{d.media.filter(m => m.profileId === p.id).length}</td><td>{d.votes.filter(v => v.profileId === p.id).length}</td><td>{day(p.createdAt)}</td><td><button className="sample-inline" onClick={() => inspect("profile", p.id)}>Inspect {p.name}</button></td></tr>)}</tbody></table></div>}
        {tab === "Votes" && <div className="sample-table-wrap"><table><thead><tr><th>Voter</th><th>Reaction</th><th>Captioned media</th><th>Date</th></tr></thead><tbody>{votes.slice(page * 12, page * 12 + 12).map(v => <tr key={v.id}><td><button className="sample-inline" onClick={() => inspect("profile", v.profileId)}>@{person(v.profileId).username}</button></td><td><span className={`sample-status ${v.value === 1 ? "succeeded" : "failed"}`}>{v.value === 1 ? "↑ Upvote" : "↓ Downvote"}</span></td><td><button className="sample-inline sample-caption-link" onClick={() => inspect("media", v.mediaId)}>{mediaById(v.mediaId).caption}</button></td><td>{day(v.createdAt)}</td></tr>)}</tbody></table></div>}
        {tab === "Generation runs" && <div className="sample-table-wrap"><table><thead><tr><th>Run</th><th>Status</th><th>Model label</th><th>Latency</th><th>Date</th></tr></thead><tbody>{runs.slice(page * 12, page * 12 + 12).map(r => <tr key={r.id}><td><button className="sample-inline" onClick={() => inspect("run", r.id)}>{r.id}</button></td><td><span className={`sample-status ${r.status}`}>{r.status}</span></td><td>{r.model}</td><td>{r.latencyMs === null ? "—" : `${(r.latencyMs / 1000).toFixed(1)}s`}</td><td>{day(r.createdAt)}</td></tr>)}</tbody></table></div>}
      </div>
      {count > 12 && <div className="sample-pagination"><span>{page * 12 + 1}–{Math.min(page * 12 + 12, count)} of {count}</span><button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><button disabled={(page + 1) * 12 >= count} onClick={() => setPage(page + 1)}>Next</button></div>}
    </section>
    {selection && <section ref={detail} tabIndex={-1} className="panel sample-detail" aria-label="Sample record details"><div className="panel-title"><span className="eyebrow">CONNECTED RECORD · FICTIONAL</span><button className="text-button" onClick={() => setSelection(null)}>Close details</button></div>
      {selectedMedia && <div className="sample-detail-grid"><Illustration media={selectedMedia} /><div><h2>{selectedMedia.caption}</h2><p className="sample-muted">{selectedMedia.context}</p><dl><dt>Record</dt><dd>{selectedMedia.id}</dd><dt>Status / style</dt><dd>{selectedMedia.status} · {selectedMedia.style}</dd><dt>Votes</dt><dd>{selectedMedia.upvotes} up · {selectedMedia.downvotes} down</dd></dl><div className="sample-related"><button onClick={() => inspect("profile", selectedMedia.profileId)}>View creator</button><button onClick={() => inspect("run", selectedMedia.runId)}>View generation run</button><button onClick={() => viewVotes(selectedMedia.id)}>View votes</button></div></div></div>}
      {selectedProfile && <><h2>{selectedProfile.name}</h2><p className="sample-muted">@{selectedProfile.username} · {selectedProfile.email}</p><p className="sample-muted">Fictional profile. This is not a real account and cannot sign in.</p><h3 className="sample-subheading">Created media</h3><div className="sample-related">{d.media.filter(m => m.profileId === selectedProfile.id).map(m => <button key={m.id} onClick={() => inspect("media", m.id)}>{m.caption}</button>)}{!d.media.some(m => m.profileId === selectedProfile.id) && <p>No created media in this sample.</p>}</div><p className="sample-muted">{d.votes.filter(v => v.profileId === selectedProfile.id).length} sample votes cast.</p></>}
      {selectedRun && <><h2>{selectedRun.id}</h2><p className="sample-muted">Synthetic generation history · no AI request was made for this record.</p><dl><dt>Status</dt><dd><span className={`sample-status ${selectedRun.status}`}>{selectedRun.status}</span></dd><dt>Model label</dt><dd>{selectedRun.model}</dd><dt>Latency</dt><dd>{selectedRun.latencyMs === null ? "Not available" : `${selectedRun.latencyMs} ms`}</dd></dl><div className="sample-run-content"><div><h3>Input</h3><p>{selectedRun.input}</p></div><div><h3>{selectedRun.error ? "Failure reason" : "Output"}</h3><p>{selectedRun.error ?? selectedRun.output ?? "Pending: no output is available."}</p></div></div>{selectedRun.mediaId && <div className="sample-related"><button onClick={() => inspect("media", selectedRun.mediaId!)}>View connected media</button></div>}</>}
    </section>}
  </div>;
}
