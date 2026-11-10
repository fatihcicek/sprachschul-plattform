import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/app/actions";

export type NavLink = { href: string; label: string };

export function Shell({ name, home, nav = [], wide = false, children }: { name: string; home: string; nav?: NavLink[]; wide?: boolean; children: ReactNode }) {
  return (
    <main className={wide ? "shell wide" : "shell"}>
      <div className="top">
        <div className="row" style={{ gap: 24 }}>
          <Link href={home} className="brand">Kurswerk</Link>
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="navlink">{n.label}</Link>
          ))}
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
  { href: "/verwaltung", label: "Kurse" },
  { href: "/lehrkraft", label: "Aufgaben" },
];
