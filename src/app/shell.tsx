import { NavItems, type NavIconName } from "@/app/nav-items";
import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/app/actions";
import { TrialBanner } from "@/app/trial-banner";
import { initials } from "@/app/ui";

export type NavLink = { href: string; label: string; icon?: NavIconName };

/** Rahmen der App: Seitenleiste mit Navigation und Person (am Handy eine Leiste oben), daneben der Inhalt. */
export function Shell({ name, home, nav = [], wide = false, children }: { name: string; home: string; nav?: NavLink[]; wide?: boolean; children: ReactNode }) {
  return (
    <div className="app">
      <aside className="sidebar">
        <Link href={home} className="brand">Kurswerk</Link>
        <NavItems nav={nav} />
        <form action={logout} className="sidebar-user">
          <span className="avatar" aria-hidden="true">{initials(name)}</span>
          <span className="sidebar-name">{name}</span>
          <button className="ghost" type="submit">Abmelden</button>
        </form>
      </aside>
      <main className="app-main">
        <div className={wide ? "shell wide" : "shell"}>
          <TrialBanner />
          {children}
        </div>
      </main>
    </div>
  );
}

export const ADMIN_NAV: NavLink[] = [
  { href: "/verwaltung/heute", label: "Heute", icon: "today" },
  { href: "/unterricht", label: "Unterricht", icon: "lessons" },
  { href: "/verwaltung", label: "Kurse", icon: "courses" },
  { href: "/verwaltung/personen", label: "Personen", icon: "people" },
  { href: "/lehrkraft", label: "Aufgaben", icon: "tasks" },
  { href: "/verwaltung/einstellungen", label: "Einstellungen", icon: "settings" },
];

export const TEACHER_NAV: NavLink[] = [
  { href: "/unterricht", label: "Unterricht", icon: "lessons" },
  { href: "/lehrkraft", label: "Aufgaben", icon: "tasks" },
];
