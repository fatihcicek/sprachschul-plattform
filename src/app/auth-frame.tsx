// Gemeinsamer Rahmen für alle Seiten vor der Anmeldung (Anmelden, Registrieren, Einladung, Passwort vergessen):
// links das dunkle Feld mit Marke und Zeitleisten-Motiv, rechts der Inhalt. Am Handy nur eine schmale Kopfzeile.
import type { ReactNode } from "react";

// Dekoration: Einwahlbalken von … bis … Prozent der Terminzeit (erfunden).
const ART_BARS: [number, number][] = [[0, 100], [6, 100], [10, 54], [0, 100], [22, 100]];

export function AuthFrame({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="auth">
      <div className="auth-side" aria-hidden="true">
        <span className="auth-brand">Kurswerk</span>
        <div className="auth-art">
          {ART_BARS.map(([from, to], i) => (
            <span key={i} className="auth-bar"><i style={{ left: `${from}%`, width: `${to - from}%` }} /></span>
          ))}
        </div>
        <p className="auth-claim">Anwesenheit, Protokoll und Klassenbuch an einem Ort.</p>
      </div>
      <main className="auth-main">
        <div className={wide ? "auth-box wide" : "auth-box"}>{children}</div>
      </main>
    </div>
  );
}
