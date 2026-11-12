"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavIconName = "today" | "lessons" | "courses" | "people" | "tasks" | "settings";
type NavLink = { href: string; label: string; icon?: NavIconName };

/** Schlichte Linienzeichen, nur zur Orientierung; der Text steht immer daneben. */
const ICONS: Record<NavIconName, string> = {
  today: "M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  lessons: "M4 5h16v11H4zM9 20h6M12 16v4",
  courses: "M4 5h7a3 3 0 013 3v12a2 2 0 00-2-2H4zM20 5h-7a3 3 0 00-3 3",
  people: "M16 19v-1a4 4 0 00-4-4H8a4 4 0 00-4 4v1M10 10a3 3 0 100-6 3 3 0 000 6zM20 19v-1a3 3 0 00-2-2.8M16 4.2a3 3 0 010 5.6",
  tasks: "M5 5h14v14H5zM9 12l2.2 2.2L15.5 10",
  settings: "M4 7h10M18 7h2M4 17h2M10 17h10M16 4v6M8 14v6",
};

function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg className="navicon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

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
          {n.icon && <NavIcon name={n.icon} />}
          <span>{n.label}</span>
        </Link>
      ))}
    </nav>
  );
}
