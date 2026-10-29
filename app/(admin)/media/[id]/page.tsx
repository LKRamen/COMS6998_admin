import { notFound } from "next/navigation";
import { read, type Collection, type Media } from "../../../../lib/data";
import { isUuid } from "../../../../lib/caption-input";
import { PageHeading, Badge } from "../../../components/ui";
import MediaForm from "../../../components/media-form";
export const metadata = { title: "Manage media" };
export default async function Detail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; created?: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const d = await read<Collection<Media>>("media", "", 0, id),
    media = d.rows[0];
  if (!media) notFound();
  const { saved, created } = await searchParams;
  return (
    <>
      <PageHeading
        eyebrow={`MEDIA / ${id.slice(0, 8).toUpperCase()}`}
        title={media.status === "draft" ? "Find your punchline." : "Behind the meme."}
        description={`Created by @${media.username ?? "creator"} · ${media.upvotes} upvotes · ${media.downvotes} downvotes`}
      >
        <Badge tone={media.status === "published" ? "green" : "neutral"}>
          {media.status}
        </Badge>
      </PageHeading>
      {created && <p className="success-box" role="status">Three captions are ready. Your draft is saved privately — choose your favorite below.</p>}
      {saved && (
        <p className="success-box" role="status">
          Media saved successfully.
        </p>
      )}
      <MediaForm key={media.updated_at} media={media} />
    </>
  );
}
