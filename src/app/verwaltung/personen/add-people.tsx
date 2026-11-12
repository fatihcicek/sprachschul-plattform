"use client";

import { useState, useTransition } from "react";
import { addPeopleAction } from "@/app/actions";
import { decodeTableFile, IMPORT_TEMPLATE, MAX_IMPORT_BYTES, parsePeopleTable, type ImportResult } from "@/domain/people-import";
import type { AddableRole } from "@/domain/permissions";

const ROLE_LABEL: Record<AddableRole, string> = { LEARNER: "Teilnehmende/r", TEACHER: "Lehrkraft", STAFF: "Verwaltung" };

type Mode = "closed" | "single" | "table";

/** Personen anlegen: einzeln über ein kurzes Formular oder mehrere aus einer Tabelle (Excel, CSV). */
export function AddPeople({ roles }: { roles: AddableRole[] }) {
  const [mode, setMode] = useState<Mode>("closed");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [role, setRole] = useState<AddableRole>(roles[0] ?? "LEARNER");
  const [single, setSingle] = useState({ firstName: "", lastName: "", email: "" });
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ImportResult | null>(null);

  if (roles.length === 0) return null;

  const submit = (people: { firstName: string; lastName: string; email: string }[]) =>
    start(async () => {
      setError(null);
      const r = await addPeopleAction(people.map((p) => ({ ...p, role })));
      if (!r.ok) return setError(r.message);
      setDone(r.created === 1 ? "1 Person angelegt. Erzeuge unten den Einladungslink, damit sie sich anmelden kann." : `${r.created} Personen angelegt. Erzeuge unten die Einladungslinks, damit sie sich anmelden können.`);
      setSingle({ firstName: "", lastName: "", email: "" });
      setText("");
      setPreview(null);
      setMode("closed");
    });

  const open = (m: Mode) => {
    setMode(m);
    setError(null);
    setDone(null);
    // Rolle nicht aus dem vorherigen Formular mitnehmen: Standard ist die erste erlaubte (Teilnehmende).
    setRole(roles[0] ?? "LEARNER");
  };

  const roleField = roles.length > 1 && (
    <>
      <label htmlFor="add-role">Rolle</label>
      <select id="add-role" value={role} onChange={(e) => setRole(e.target.value as AddableRole)}>
        {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
      </select>
    </>
  );

  return (
    <div className="addpeople">
      {done && <div className="okbox" role="status">{done}</div>}
      {mode === "closed" && (
        <div className="addpeople-buttons">
          <button type="button" onClick={() => open("single")}>Person hinzufügen</button>
          <button type="button" className="ghost" onClick={() => open("table")}>Aus Tabelle übernehmen</button>
        </div>
      )}
      {mode === "single" && (
        <form className="card" onSubmit={(e) => { e.preventDefault(); submit([single]); }}>
          <strong>Person hinzufügen</strong>
          <div className="grid2">
            <div>
              <label htmlFor="add-first">Vorname</label>
              <input id="add-first" required maxLength={200} value={single.firstName} onChange={(e) => setSingle({ ...single, firstName: e.target.value })} />
            </div>
            <div>
              <label htmlFor="add-last">Nachname</label>
              <input id="add-last" required maxLength={200} value={single.lastName} onChange={(e) => setSingle({ ...single, lastName: e.target.value })} />
            </div>
          </div>
          <label htmlFor="add-email">E-Mail</label>
          <input id="add-email" type="email" required maxLength={254} value={single.email} onChange={(e) => setSingle({ ...single, email: e.target.value })} />
          {roleField}
          {error && <div className="err" role="alert">{error}</div>}
          <div className="actions">
            <button type="button" className="ghost" onClick={() => open("closed")}>Abbrechen</button>
            <button type="submit" disabled={pending}>{pending ? "Wird angelegt …" : "Person anlegen"}</button>
          </div>
        </form>
      )}
      {mode === "table" && (
        <div className="card">
          <strong>Aus Tabelle übernehmen</strong>
          <label htmlFor="add-table">
            Zeilen aus Excel hier einfügen <span className="muted">oder eine CSV-Datei wählen. Spalten: Vorname, Nachname, E-Mail.</span>
          </label>
          <textarea id="add-table" value={text} onChange={(e) => { setText(e.target.value); setPreview(null); }} style={{ minHeight: 120 }} placeholder={"Vorname\tNachname\tE-Mail"} />
          <div className="addpeople-buttons" style={{ marginTop: 8 }}>
            <label className="ghost filepick" style={{ margin: 0 }}>
              CSV-Datei wählen
              <input
                type="file"
                accept=".csv,.txt,text/csv"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  if (f.size > MAX_IMPORT_BYTES) return setError("Die Datei ist zu groß (höchstens 1 MB).");
                  const t = decodeTableFile(new Uint8Array(await f.arrayBuffer()));
                  setText(t);
                  setError(null);
                  setPreview(parsePeopleTable(t));
                }}
              />
            </label>
            <a className="muted" download="personen-vorlage.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent("﻿" + IMPORT_TEMPLATE)}`}>Vorlage herunterladen</a>
          </div>
          {roleField}
          {!preview && (
            <div className="actions">
              <button type="button" className="ghost" onClick={() => open("closed")}>Abbrechen</button>
              <button type="button" disabled={!text.trim()} onClick={() => { setError(null); setPreview(parsePeopleTable(text)); }}>Vorschau</button>
            </div>
          )}
          {preview && (
            <div role="status">
              {preview.problems.length > 0 && (
                <div className="warn">
                  {preview.problems.length === 1 ? "1 Zeile wird nicht übernommen:" : `${preview.problems.length} Zeilen werden nicht übernommen:`}
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                    {preview.problems.slice(0, 10).map((p) => <li key={`${p.line}-${p.message}`}>{p.line > 0 ? `Zeile ${p.line}: ` : ""}{p.message}</li>)}
                  </ul>
                  {preview.problems.length > 10 && <div>… und {preview.problems.length - 10} weitere</div>}
                </div>
              )}
              {preview.people.length > 0 && (
                <>
                  <p className="muted" style={{ marginBottom: 6 }}>
                    {preview.people.length === 1 ? "1 Person wird" : `${preview.people.length} Personen werden`} als {ROLE_LABEL[role]} angelegt. Noch ist nichts gespeichert.
                  </p>
                  <table className="ptable">
                    <thead><tr><th>Vorname</th><th>Nachname</th><th>E-Mail</th></tr></thead>
                    <tbody>
                      {preview.people.slice(0, 50).map((p) => <tr key={p.email}><td>{p.firstName}</td><td>{p.lastName}</td><td>{p.email}</td></tr>)}
                    </tbody>
                  </table>
                  {preview.people.length > 50 && <p className="muted">… und {preview.people.length - 50} weitere</p>}
                </>
              )}
            </div>
          )}
          {error && <div className="err" role="alert">{error}</div>}
          {preview && (
            <div className="actions">
              <button type="button" className="ghost" onClick={() => open("closed")}>Abbrechen</button>
              <button type="button" disabled={pending || preview.people.length === 0} onClick={() => submit(preview.people.map(({ firstName, lastName, email }) => ({ firstName, lastName, email })))}>
                {pending ? "Wird angelegt …" : preview.people.length === 1 ? "1 Person anlegen" : `${preview.people.length} Personen anlegen`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
