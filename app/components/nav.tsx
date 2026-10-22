"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const links = [
  ["/", "Overview", "◫"],
  ["/media", "Media library", "▧"],
  ["/users", "Community", "♙"],
  ["/ratings", "Vote ledger", "↕"],
];
export default function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Admin navigation">
      {links.map(([href, label, icon]) => {
        const active = href === "/" ? path === href : path.startsWith(href);
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
