/**
 * Fictional, read-only teaching data. No record was imported from a real user.
 * Relationships mirror Too Soon's profiles, images/captions, votes, requests,
 * and model responses. These records must never be written to live tables.
 */
export type SampleStyleName = "dry" | "sarcastic" | "wholesome" | "brainrot";
export type SampleProfile = { id: string; name: string; username: string; email: string; createdAt: string };
export type SampleMedia = {
  id: string; profileId: string; caption: string; context: string; style: SampleStyleName;
  status: "published" | "draft"; createdAt: string; upvotes: number; downvotes: number; runId: string;
};
export type SampleVote = { id: string; profileId: string; mediaId: string; value: 1 | -1; createdAt: string };
export type SampleRun = {
  id: string; mediaId: string | null; status: "succeeded" | "failed" | "pending";
  model: string; latencyMs: number | null; input: string; output: string | null;
  error: string | null; createdAt: string;
};
export type SampleActivity = { day: string; media: number; votes: number; runs: number };
export type SampleStyle = { style: SampleStyleName; total: number; votes: number; upvotes: number; downvotes: number; approvalRate: number | null };
export type SampleSummary = {
  profiles: number; media: number; published: number; drafts: number; votes: number;
  upvotes: number; downvotes: number; approvalRate: number; runs: number;
  succeeded: number; failed: number; pending: number; averageLatencyMs: number;
};
export type SampleDataset = {
  profiles: SampleProfile[]; media: SampleMedia[]; votes: SampleVote[]; runs: SampleRun[];
  activity: SampleActivity[]; styles: SampleStyle[]; summary: SampleSummary;
};
export const sampleDisclosure = "Fictional sample data. Profiles, votes, images and model responses are simulated; no live activity or AI requests are included.";
export const samplePeriod = { start: "2026-10-23", end: "2026-11-05", label: "Oct 23 – Nov 5, 2026 · UTC" };
const dayMs = 86_400_000;
const start = Date.parse(`${samplePeriod.start}T00:00:00.000Z`);
const at = (day: number, minute = 0) => new Date(start + day * dayMs + minute * 60_000).toISOString();
const id = (kind: string, index: number) => `sample-${kind}-${String(index + 1).padStart(3, "0")}`;
const names = [
  ["Avery Finch", "avery.afterhours"], ["Maya Brooks", "maya.makes"],
  ["Theo Vale", "theo.onmute"], ["Nora Ellis", "nora.notes"],
  ["Jules Park", "jules.inframe"], ["Sam Rowan", "sam.sidequest"],
  ["Lena Reed", "lena.lately"], ["Owen Moss", "owen.offline"],
  ["Iris Blake", "iris.edits"], ["Noah Lane", "noah.naps"],
  ["Ruby West", "ruby.reacts"], ["Leo Hart", "leo.lurks"],
  ["Milo Quinn", "milo.moments"], ["Ada Rivers", "ada.almost"],
  ["Finn Cole", "finn.foundit"], ["Esme Gray", "esme.explains"],
  ["Arlo Bell", "arlo.again"], ["Cleo Stone", "cleo.captions"],
];
const profiles: SampleProfile[] = names.map(([name, username], i) => ({
  id: id("profile", i), name, username, email: `${username}@example.invalid`, createdAt: at(0, 60 + i),
}));
const scenes: [string, string][] = [
  ["A cat sits on a laptop beside an unopened notebook.", "The project manager has declined your meeting."],
  ["A student holds a tiny umbrella in heavy rain.", "Excellent. A weather solution for one shoulder."],
  ["Two friends share an oversized scarf on a cold bench.", "A small reminder that warmth is better shared."],
  ["A pigeon stands on a chessboard in the park.", "bro queued ranked and ate the rook"],
  ["A coffee cup rests on a stack of unread textbooks.", "The most productive member of this study group."],
  ["A suitcase is packed with nothing but charging cables.", "Packing light. Emotionally dependent on twelve devices."],
  ["A dog waits patiently beside a bicycle.", "Every route is the scenic route with you."],
  ["A squirrel carries a bagel larger than its head.", "side quest rewards are getting unreasonable"],
  ["An office plant leans toward a window far from the desk.", "Even the plant has an exit strategy."],
  ["A crowded desk has a calendar marked with a single free hour.", "Love this generous work-life minute."],
  ["A neighbor leaves flowers outside a friend's door.", "Some good mornings arrive before you wake up."],
  ["A raccoon looks into a nearly empty snack cupboard.", "the pantry has entered its flop era"],
  ["A runner pauses at a bakery window mid-jog.", "An important checkpoint in the training plan."],
  ["A student has color-coded every item except the assignment.", "The deadline will appreciate the palette."],
  ["A child and grandparent water a small balcony garden.", "Growing something together counts twice."],
  ["A dog wears headphones beside a silent microphone.", "podcast guest has absolutely no media training"],
  ["A library cart is filled with books about organization.", "The irony is filed alphabetically."],
  ["A person opens a fridge while holding a grocery list.", "Just checking whether ingredients have spawned."],
  ["Friends watch the sunset from a rooftop with mugs of tea.", "Nothing impressive. Just a very good evening."],
  ["A frog sits on a miniature garden chair.", "me after completing one email and calling it a sprint"],
  ["A backpack rests next to a half-finished puzzle.", "A carefully managed collection of unfinished business."],
  ["A kitchen timer sits beside a burned slice of toast.", "Delighted to report the alarm has excellent hindsight."],
  ["A hand offers a paper airplane to a friend.", "For the days that could use a little lift."],
  ["A duck walks past a sign asking visitors to stay on the path.", "terms and conditions remain undefeated"],
];
const styleNames: SampleStyleName[] = ["dry", "sarcastic", "wholesome", "brainrot"];
const media: SampleMedia[] = scenes.map(([context, caption], i) => ({
  id: id("media", i), profileId: profiles[i % profiles.length].id, caption, context,
  style: styleNames[i % styleNames.length], status: i < 20 ? "published" : "draft",
  createdAt: at(i < 20 ? Math.floor(i / 2) : 11 + Math.floor((i - 20) / 2), 600 + i * 5),
  upvotes: 0, downvotes: 0, runId: id("run", i),
}));
const votes: SampleVote[] = [];
media.filter(item => item.status === "published").forEach((item, mediaIndex) => {
  const voters = profiles.filter(profile => profile.id !== item.profileId);
  const count = 8 + mediaIndex % 9;
  for (let n = 0; n < count; n++) {
    const value: 1 | -1 = (n * 3 + mediaIndex) % 10 < [7, 5, 9, 6][mediaIndex % 4] ? 1 : -1;
    const createdDay = Math.floor((Date.parse(item.createdAt) - start) / dayMs);
    votes.push({ id: id("vote", votes.length), profileId: voters[(n + mediaIndex) % voters.length].id,
      mediaId: item.id, value, createdAt: at(createdDay + n % (14 - createdDay), 900 + n * 3) });
  }
  item.upvotes = votes.filter(v => v.mediaId === item.id && v.value === 1).length;
  item.downvotes = votes.filter(v => v.mediaId === item.id && v.value === -1).length;
});
const runs: SampleRun[] = media.map((item, i) => ({
  id: item.runId, mediaId: item.id, status: "succeeded", model: i % 3 ? "Sample caption model A" : "Sample caption model B",
  latencyMs: 1250 + (i * 487) % 5200,
  input: `Synthetic request: write a ${item.style} caption. Image description: ${item.context}`,
  output: `Synthetic model response: ${item.caption}`, error: null,
  createdAt: new Date(Date.parse(item.createdAt) - 120_000).toISOString(),
}));
const failures = [
  "Simulated provider timeout: no response within 30 seconds.",
  "Simulated rate limit: retry after 60 seconds.",
  "Simulated validation error: response did not match the caption format.",
  "Simulated input error: the uploaded image could not be decoded.",
];
failures.forEach((error, i) => runs.push({ id: id("run", 24 + i), mediaId: null, status: "failed",
  model: "Sample caption model A", latencyMs: [30000, 210, 2380, 45][i],
  input: `Synthetic request: create a ${styleNames[i]} caption for a campus scene.`,
  output: null, error, createdAt: at(5 + i * 2, 720),
}));
for (let i = 0; i < 2; i++) runs.push({ id: id("run", 28 + i), mediaId: null, status: "pending",
  model: "Sample caption model B", latencyMs: null, input: `Synthetic queued request ${i + 1}: caption an everyday scene.`,
  output: null, error: null, createdAt: at(13, 1000 + i),
});
const activity: SampleActivity[] = Array.from({ length: 14 }, (_, i) => {
  const day = at(i).slice(0, 10);
  const onDay = (item: { createdAt: string }) => item.createdAt.startsWith(day);
  return { day, media: media.filter(onDay).length, votes: votes.filter(onDay).length, runs: runs.filter(onDay).length };
});
const styles: SampleStyle[] = styleNames.map(style => {
  const items = media.filter(item => item.style === style);
  const upvotes = items.reduce((sum, item) => sum + item.upvotes, 0);
  const downvotes = items.reduce((sum, item) => sum + item.downvotes, 0);
  return { style, total: items.length, votes: upvotes + downvotes, upvotes, downvotes,
    approvalRate: upvotes + downvotes ? Math.round(upvotes / (upvotes + downvotes) * 100) : null };
});
const upvotes = votes.filter(vote => vote.value === 1).length;
const succeeded = runs.filter(run => run.status === "succeeded");
const summary: SampleSummary = {
  profiles: profiles.length, media: media.length, published: media.filter(item => item.status === "published").length,
  drafts: media.filter(item => item.status === "draft").length, votes: votes.length, upvotes,
  downvotes: votes.length - upvotes, approvalRate: Math.round(upvotes / votes.length * 100),
  runs: runs.length, succeeded: succeeded.length, failed: runs.filter(run => run.status === "failed").length,
  pending: runs.filter(run => run.status === "pending").length,
  averageLatencyMs: Math.round(succeeded.reduce((sum, run) => sum + (run.latencyMs ?? 0), 0) / succeeded.length),
};
export const sampleDataset: SampleDataset = { profiles, media, votes, runs, activity, styles, summary };
