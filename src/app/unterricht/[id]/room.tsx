"use client";

import { useState, useTransition } from "react";
import { closeSessionAction, confirmAttendanceAction, proposeAttendanceAction, saveRegisterAction, setStatusAction } from "@/app/actions";

type Interval = { start: string; end: string };
export type LearnerView = {
  membershipId: string;
  name: string;
  recordId: string | null;
  status: "PRESENT" | "PARTIAL" | "ABSENT" | "EXCUSED" | null;
  reviewState: "PROPOSED" | "CONFIRMED" | null;
  presentMinutes: number | null;
  confirmedLine: string | null;
  intervals: Interval[];
  openEnded: boolean;
  corrections: string[];
};
type Result = { ok: true } | { ok: false; message: string };
type WithVersion = { ok: true; version: string } | { ok: false; message: string };

const STATUS_DE = { PRESENT: "anwesend", PARTIAL: "teilweise anwesend", ABSENT: "abwesend", EXCUSED: "entschuldigt" } as const;

function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      const r = await fn();
      setError(r.ok ? null : r.message);
    });
  return { pending, error, run };
}

export function Attendance({ sessionId, learners, started, over, closed, canReview, canCorrect }: { sessionId: string; learners: LearnerView[]; started: boolean; over: boolean; closed: boolean; canReview: boolean; canCorrect: boolean }) {
  const { pending, error, run } = useAction();
  const hasRecords = learners.some((l) => l.recordId);
  const hasOpen = learners.some((l) => l.reviewState === "PROPOSED");
  return (
    <div className="card">
      <div className="row">
        <strong>Anwesenheit</strong>
        <div style={{ display: "flex", gap: 8 }}>
          {canReview && started && !closed && (
            <button type="button" className="ghost" disabled={pending} onClick={() => run(() => proposeAttendanceAction(sessionId))}>
              {hasRecords ? "Neu aus Einwahlprotokoll berechnen" : "Aus Einwahlprotokoll berechnen"}
            </button>
          )}
          {canReview && over && hasOpen && (
            <button type="button" disabled={pending} onClick={() => {
              const warn = learners.some((l) => l.openEnded) ? "\n\nAchtung: Bei manchen Personen endet die letzte Einwahl ohne Abmeldung. Bitte prüfe sie vorher." : "";
              if (window.confirm(`Alle ${learners.filter((l) => l.reviewState === "PROPOSED").length} Vorschläge bestätigen? Danach sind Änderungen nur noch mit Begründung möglich.${warn}`)) run(() => confirmAttendanceAction(sessionId));
            }}>Alle Vorschläge bestätigen</button>
          )}
        </div>
      </div>
      {!started && <p className="muted">Der Termin hat noch nicht begonnen.</p>}
      {error && <div className="err" role="alert">{error}</div>}
      {learners.length === 0 && <p className="muted">Keine Teilnehmenden an diesem Tag.</p>}
      {learners.map((l) => (
        <LearnerRow key={l.membershipId} sessionId={sessionId} l={l} canEdit={l.reviewState === "CONFIRMED" ? canCorrect : canReview} />
      ))}
      {hasOpen && !over && started && <p className="muted">Bestätigen ist nach Ende des Termins möglich.</p>}
    </div>
  );
}

function LearnerRow({ sessionId, l, canEdit }: { sessionId: string; l: LearnerView; canEdit: boolean }) {
  const { pending, error, run } = useAction();
  const [next, setNext] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const confirmed = l.reviewState === "CONFIRMED";
  const save = (status: string) => run(async () => {
    const r = await setStatusAction(sessionId, l.recordId!, status, reason);
    if (r.ok) { setNext(null); setReason(""); }
    return r;
  });
  return (
    <div className="person" style={{ flexWrap: "wrap" }}>
      <div className="grow">
        <strong>{l.name}</strong>
        <div className="muted">
          {l.intervals.length === 0 ? "Keine Einwahl" : l.intervals.map((i) => `${i.start}–${i.end}`).join(", ")}
          {l.presentMinutes !== null && ` · ${l.presentMinutes} Min.`}
          {l.openEnded && " · letzte Einwahl ohne Abmeldung, bitte prüfen"}
        </div>
        {l.confirmedLine && <div className="muted">{l.confirmedLine}</div>}
        {l.corrections.map((c, i) => <div key={i} className="muted">Korrigiert: {c}</div>)}
      </div>
      {l.status ? (
        <>
          <span className={`badge ${confirmed ? "RETURNED" : "open"}`}>{confirmed ? "bestätigt" : "Vorschlag"}</span>
          <select aria-label={`Status ${l.name}`} style={{ width: "auto" }} disabled={!canEdit || pending} value={next ?? l.status} onChange={(e) => (confirmed ? setNext(e.target.value) : save(e.target.value))}>
            {Object.entries(STATUS_DE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </>
      ) : <span className="badge">noch nicht berechnet</span>}
      {next && next !== l.status && (
        <div className="warn" style={{ flexBasis: "100%" }}>
          <label htmlFor={`r-${l.membershipId}`}>Begründung für die Korrektur (wird dauerhaft festgehalten)</label>
          <input id={`r-${l.membershipId}`} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button type="button" disabled={pending || !reason.trim()} onClick={() => save(next)}>Korrektur speichern</button>
            <button type="button" className="ghost" onClick={() => { setNext(null); setReason(""); }}>Abbrechen</button>
          </div>
        </div>
      )}
      {error && <div className="err" style={{ flexBasis: "100%" }} role="alert">{error}</div>}
    </div>
  );
}

export function Register({ sessionId, initial, version, meta, editable, reason }: { sessionId: string; initial: string; version: string | null; meta: string | null; editable: boolean; reason: string | null }) {
  const { pending, error, run } = useAction();
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [basis, setBasis] = useState(version);
  return (
    <div className="card">
      <strong>Klassenbuch</strong>
      <label htmlFor="register">Was wurde im Unterricht behandelt?</label>
      <textarea id="register" style={{ minHeight: 140 }} value={text} maxLength={5000} readOnly={!editable} onChange={(e) => { setText(e.target.value); setSaved(false); }} />
      {meta && <div className="muted" style={{ marginTop: 6 }}>{meta}</div>}
      {reason && <div className="muted" style={{ marginTop: 6 }}>{reason}</div>}
      {error && <div className="err" role="alert">{error}</div>}
      {editable && (
        <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center" }}>
          <button type="button" disabled={pending || !text.trim()} onClick={() => run(async () => { const r: WithVersion = await saveRegisterAction(sessionId, text, basis); if (r.ok) setBasis(r.version); setSaved(r.ok); return r; })}>Eintrag speichern</button>
          {saved && <span className="muted" role="status">Gespeichert.</span>}
        </div>
      )}
    </div>
  );
}

export function CloseButton({ sessionId }: { sessionId: string }) {
  const { pending, error, run } = useAction();
  return (
    <div className="card">
      <strong>Termin abschließen</strong>
      <p className="muted">Wenn alle Anwesenheiten bestätigt sind und das Klassenbuch geführt ist. Danach ist das Klassenbuch gesperrt; Anwesenheit ändert sich nur noch mit Begründung.</p>
      {error && <div className="err" role="alert">{error}</div>}
      <button type="button" disabled={pending} onClick={() => { if (window.confirm("Termin abschließen? Das Klassenbuch wird gesperrt.")) run(() => closeSessionAction(sessionId)); }}>Termin abschließen</button>
    </div>
  );
}
