import { describe, expect, it } from "vitest";
import { sampleDataset as d, sampleDisclosure, samplePeriod } from "../lib/sample-data";

describe("synthetic admin dataset", () => {
  it("contains a clearly fictional, connected dataset with varied outcomes", () => {
    expect(d.profiles).toHaveLength(18);
    expect(d.media).toHaveLength(24);
    expect(d.runs).toHaveLength(30);
    expect(d.votes.length).toBeGreaterThanOrEqual(180);
    expect(d.summary).toMatchObject({ published: 20, drafts: 4, succeeded: 24, failed: 4, pending: 2 });
    expect(sampleDisclosure).toContain("simulated");
    expect(d.profiles.every(p => p.email.endsWith("@example.invalid"))).toBe(true);
    for (const group of [d.profiles, d.media, d.votes, d.runs]) {
      expect(new Set(group.map(item => item.id)).size).toBe(group.length);
      expect(group.every(item => item.id.startsWith("sample-"))).toBe(true);
    }
  });
  it("keeps all foreign references valid and prevents duplicate or self votes", () => {
    const people = new Set(d.profiles.map(p => p.id));
    for (const item of d.media) {
      expect(people.has(item.profileId)).toBe(true);
      expect(d.runs.find(run => run.id === item.runId)?.mediaId).toBe(item.id);
    }
    expect(new Set(d.votes.map(v => `${v.mediaId}:${v.profileId}`)).size).toBe(d.votes.length);
    for (const vote of d.votes) {
      expect(people.has(vote.profileId)).toBe(true);
      const item = d.media.find(item => item.id === vote.mediaId)!;
      expect(item.status).toBe("published");
      expect(item.profileId).not.toBe(vote.profileId);
      expect(Date.parse(vote.createdAt)).toBeGreaterThanOrEqual(Date.parse(item.createdAt));
    }
  });
  it("derives summary, media and style totals from votes", () => {
    expect(d.summary.votes).toBe(d.votes.length);
    expect(d.summary.upvotes + d.summary.downvotes).toBe(d.votes.length);
    expect(d.styles.reduce((n, style) => n + style.total, 0)).toBe(d.media.length);
    expect(d.styles.reduce((n, style) => n + style.votes, 0)).toBe(d.votes.length);
    for (const item of d.media) {
      expect(item.upvotes).toBe(d.votes.filter(v => v.mediaId === item.id && v.value === 1).length);
      expect(item.downvotes).toBe(d.votes.filter(v => v.mediaId === item.id && v.value === -1).length);
    }
  });
  it("does not invent outputs for failed or pending requests", () => {
    for (const run of d.runs) {
      if (run.status === "succeeded") {
        expect(run.output).toMatch(/^Synthetic model response:/);
        expect(d.media.some(item => item.id === run.mediaId)).toBe(true);
        expect(run.error).toBeNull();
      } else {
        expect(run.output).toBeNull();
        expect(run.mediaId).toBeNull();
        if (run.status === "failed") expect(run.error).toMatch(/^Simulated /);
        else { expect(run.error).toBeNull(); expect(run.latencyMs).toBeNull(); }
      }
    }
  });
  it("covers exactly the labeled date range with no invented chart totals", () => {
    expect(d.activity).toHaveLength(14);
    expect(d.activity[0].day).toBe(samplePeriod.start);
    expect(d.activity.at(-1)?.day).toBe(samplePeriod.end);
    expect(d.activity.reduce((n, day) => n + day.media, 0)).toBe(d.media.length);
    expect(d.activity.reduce((n, day) => n + day.votes, 0)).toBe(d.votes.length);
    expect(d.activity.reduce((n, day) => n + day.runs, 0)).toBe(d.runs.length);
    for (const item of [...d.media, ...d.votes, ...d.runs]) {
      expect(item.createdAt.slice(0, 10) >= samplePeriod.start).toBe(true);
      expect(item.createdAt.slice(0, 10) <= samplePeriod.end).toBe(true);
    }
  });
});
