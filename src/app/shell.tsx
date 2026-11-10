import { NavItems } from "@/app/nav-items";
import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/app/actions";

export type NavLink = { href: string; label: string };

export function Shell({ name, home, nav = [], wide = false, children }: { name: string; home: string; nav?: NavLink[]; wide?: boolean; children: ReactNode }) {
  return (
    <main className={wide ? "shell wide" : "shell"}>
      <div className="top">
        <div className="row" style={{ gap: 20 }}>
          <Link href={home} className="brand">Kurswerk</Link>
          <NavItems nav={nav} />
        </div>
        <form action={logout} className="row" style={{ gap: 12 }}>
          <span className="muted">{name}</span>
          <button className="ghost" type="submit">Abmelden</button>
        </form>
      </div>
      {children}
    </main>
  );
}

export const ADMIN_NAV: NavLink[] = [
  { href: "/verwaltung/heute", label: "Heute" },
  { href: "/unterricht", label: "Unterricht" },
  { href: "/verwaltung", label: "Kurse" },
  { href: "/verwaltung/personen", label: "Personen" },
  { href: "/lehrkraft", label: "Aufgaben" },
];

export const TEACHER_NAV: NavLink[] = [
  { href: "/unterricht", label: "Unterricht" },
  { href: "/lehrkraft", label: "Aufgaben" },
];
