import Link from "next/link";
import { isPipelineCatalog, pipelineSections } from "../../lib/pipeline-navigation";

export default function PipelineGuide({ kind }: { kind: string }) {
  if (!isPipelineCatalog(kind)) return null;
  return (
    <nav className="studio-navigation" aria-label="Pipeline studio sections">
      {pipelineSections.map((section) => (
        <div className="studio-navigation-group" key={section.label}>
          <span className="studio-navigation-label">{section.label}</span>
          <div>{section.links.map(([key, title]) => (
            <Link key={key} href={key === "pipelines" ? "/pipelines" : `/catalog/${key}`} aria-current={key === kind ? "page" : undefined}>
              {title}
            </Link>
          ))}</div>
        </div>
      ))}
    </nav>
  );
}
