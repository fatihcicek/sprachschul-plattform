"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLink = { href: string; label: string };

/** Hebt den aktuellen Bereich hervor. Der Eintrag mit dem längsten passenden Pfad gewinnt. */
export function NavItems({ nav }: { nav: NavLink[] }) {
  const path = usePathname() ?? "";
  const current = nav
    .filter((n) => path === n.href || path.startsWith(n.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav className="nav" aria-label="Hauptnavigation">
      {nav.map((n) => (
        <Link key={n.href} href={n.href} className={n.href === current ? "navlink active" : "navlink"} aria-current={n.href === current ? "page" : undefined}>
          {n.label}
        </Link>
      ))}
    </nav>
  );
}
