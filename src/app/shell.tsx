import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/app/actions";

export function Shell({ name, home, children }: { name: string; home: string; children: ReactNode }) {
  return (
    <main className="shell">
      <div className="top">
        <Link href={home} className="brand">Kurswerk</Link>
        <form action={logout} className="row" style={{ gap: 12 }}>
          <span className="muted">{name}</span>
          <button className="ghost" type="submit">Abmelden</button>
        </form>
      </div>
      {children}
    </main>
  );
}
