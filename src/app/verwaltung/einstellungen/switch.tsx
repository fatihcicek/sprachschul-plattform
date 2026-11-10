"use client";

import { useState, useTransition } from "react";
import { setBamfAction } from "@/app/actions";

export function BamfSwitch({ enabled, canChange }: { enabled: boolean; canChange: boolean }) {
  const [on, setOn] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const change = (next: boolean) => {
    setError(null);
    start(async () => {
      const r = await setBamfAction(next);
      if (r.ok) setOn(next);
      else setError(r.message);
    });
  };
  return (
    <div className="card">
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: 0, fontSize: 16 }}>
        <input type="checkbox" checked={on} disabled={!canChange || pending} onChange={(e) => change(e.target.checked)} style={{ marginTop: 4 }} />
        <span>
          <strong>BAMF-Funktionen</strong>
          <span className="muted" style={{ display: "block" }}>
            Für Schulen mit Integrations- oder Berufssprachkursen: BAMF-Kursnummer, BAMF-Förderung der Teilnehmenden, Einwahlprotokoll als Nachweis und Hinweise zu den Regeln für Onlineunterricht.
            Wenn aus, siehst und brauchst du das alles nicht. Bereits eingetragene Daten bleiben erhalten.
          </span>
        </span>
      </label>
      {!canChange && <p className="muted" style={{ marginBottom: 0 }}>Nur die Leitung kann das ändern.</p>}
      {error && <div className="err" role="alert">{error}</div>}
    </div>
  );
}
