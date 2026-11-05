"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { catalogs } from "../../lib/catalog";
import { isPipelineCatalog, isPipelinePath } from "../../lib/pipeline-navigation";
const links = [
  ["/", "Overview", "◫"],
  ["/samples", "Sample workspace", "◈"],
  ["/media", "Media library", "▧"],
  ["/users", "Community", "♙"],
  ["/ratings", "Vote ledger", "↕"],
  ["/pipelines", "Pipeline studio", "◇"],
  ...Object.entries(catalogs).filter(([key]) => !isPipelineCatalog(key)).map(([key, spec]) => [
    `/catalog/${key}`,
    spec.title,
    "≡",
  ]),
];
export default function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Admin navigation">
      {links.map(([href, label, icon]) => {
        const active = href === "/" ? path === href : href === "/pipelines" ? isPipelinePath(path) : path === href || path.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={active ? "nav-active" : ""}
          >
            <span aria-hidden="true">{icon}</span>
            {label}
            {href === "/" && <i />}
          </Link>
        );
      })}
    </nav>
  );
}
