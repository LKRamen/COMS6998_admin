import Link from "next/link";
import { requireAdmin } from "../../../lib/auth";
import { PageHeading } from "../../components/ui";
import SampleWorkspace from "../../components/sample-workspace";
import "../../samples.css";
export const metadata = { title: "Sample workspace" };
export default async function SamplesPage() {
  await requireAdmin();
  return <><PageHeading eyebrow="EXPLORE WITHOUT CHANGING LIVE DATA" title="A community to explore." description="Follow a caption from creation to its audience. Compare styles, inspect failures, and explore the relationships behind the numbers."><Link className="button" href="/">Back to live overview ↗</Link></PageHeading><SampleWorkspace /></>;
}
