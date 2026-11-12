// Gemeinsame Bausteine für alle Seiten nach der Anmeldung: Seitenkopf, Leerzustand, Personenkürzel.
import type { ReactNode } from "react";

/** Seitenkopf: Titel, optional ein erklärender Satz und rechts die wichtigste Handlung der Seite. */
export function PageHead({ title, lead, action }: { title: string; lead?: ReactNode; action?: ReactNode }) {
  return (
    <header className="pagehead">
      <div>
        <h1>{title}</h1>
        {lead && <p className="pagehead-lead">{lead}</p>}
      </div>
      {action && <div className="pagehead-action">{action}</div>}
    </header>
  );
}

/** Leerzustand: sagt, was hier stehen wird, und bietet den nächsten Schritt an. */
export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/** Rundes Kürzel für Personenlisten (nur Schmuck, der Name steht daneben). */
export function Initials({ name }: { name: string }) {
  return <span className="avatar soft" aria-hidden="true">{initials(name)}</span>;
}
