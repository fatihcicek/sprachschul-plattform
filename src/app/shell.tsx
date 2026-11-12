import { NavItems, type NavLink } from "@/app/nav-items";
import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/app/actions";
import { TrialBanner } from "@/app/trial-banner";
import { initials } from "@/app/ui";

export type { NavLink };

/** Rahmen der App: Seitenleiste mit Navigation und Person (am Handy eine Leiste oben), daneben der Inhalt. */
export function Shell({ name, home, nav = [], wide = false, children }: { name: string; home: string; nav?: NavLink[]; wide?: boolean; children: ReactNode }) {
  return (
    <div className="app">
      <a href="#inhalt" className="skip">Zum Inhalt springen</a>
      <header className="sidebar">
        <Link href={home} className="brand">Kurswerk</Link>
        {nav.length > 0 && <NavItems nav={nav} />}
        <form action={logout} className="sidebar-user">
          <span className="avatar" aria-hidden="true">{initials(name)}</span>
          <span className="sidebar-name">{name}</span>
          <button className="ghost" type="submit">Abmelden</button>
        </form>
      </header>
      <main className="app-main" id="inhalt" tabIndex={-1}>
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

/** Verwaltung: wie die Leitung, aber ohne Aufgaben (Aufgaben stellen und bewerten nur Lehrkräfte und Leitung). */
export const STAFF_NAV: NavLink[] = ADMIN_NAV.filter((n) => n.href !== "/lehrkraft");

export const LEARNER_NAV: NavLink[] = [{ href: "/aufgaben", label: "Aufgaben", icon: "tasks" }];

/** Navigation passend zur Rolle. Sie blendet nur aus; jede Seite prüft die Rechte selbst. */
export const navFor = (role: string | undefined): NavLink[] => (role === "ADMIN" ? ADMIN_NAV : role === "STAFF" ? STAFF_NAV : role === "TEACHER" ? TEACHER_NAV : LEARNER_NAV);
