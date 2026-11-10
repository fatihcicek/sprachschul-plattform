"use client";

import { useState, useTransition } from "react";
import { setBamfAction } from "@/app/actions";

export function BamfSwitch({ enabled, canChange, readOnly }: { enabled: boolean; canChange: boolean; readOnly: boolean }) {
  const [on, setOn] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const change = (next: boolean) => {
    setError(null);
    setSaved(false);
    start(async () => {
      const r = await setBamfAction(next);
      if (r.ok) {
        setOn(next);
        setSaved(true);
      } else setError(r.message);
    });
  };
  return (
    <div className="card">
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: 0, fontSize: 16 }}>
        <input type="checkbox" checked={on} disabled={!canChange || readOnly} aria-disabled={pending} aria-describedby="bamf-hint" onChange={(e) => change(e.target.checked)} style={{ marginTop: 4 }} />
        <span>
          <strong>BAMF-Funktionen</strong>
          <span className="muted" style={{ display: "block" }}>
            Für Schulen mit Integrations- oder Berufssprachkursen: BAMF-Kursnummer, BAMF-Förderung der Teilnehmenden, Einwahlprotokoll als Nachweis und Hinweise zu den Regeln für Onlineunterricht.
            Wenn aus, siehst und brauchst du das alles nicht. Bereits eingetragene Daten bleiben erhalten, und das Einwahlprotokoll bleibt für Kurse mit BAMF-Bezug weiter abrufbar.
          </span>
        </span>
      </label>
      <p id="bamf-hint" className="muted" style={{ marginBottom: 0 }}>
        {!canChange ? "Nur die Leitung kann das ändern." : readOnly ? "Die Testzeit ist abgelaufen: Einstellungen sind gesperrt." : pending ? "Wird gespeichert …" : ""}
      </p>
      {saved && <div className="okbox" role="status">Gespeichert.</div>}
      {error && <div className="err" role="alert">{error}</div>}
    </div>
  );
}
