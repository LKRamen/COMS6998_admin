import { PageHeading } from "../../../components/ui";
import MediaCreator from "../../../components/media-creator";
export const metadata = { title: "Create media" };
export default function Create() {
  return (
    <>
      <PageHeading
        eyebrow="MAKE ROOM FOR SOMETHING NEW"
        title="Make your next Quip."
        description="Start with a photo. Find your punchline. Share it when it’s ready."
      />
      <MediaCreator />
    </>
  );
}
