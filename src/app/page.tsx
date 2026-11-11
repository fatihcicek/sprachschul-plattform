import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { memberships } from "@/db/schema";
import { timelineSegments } from "@/domain/attendance";
import { registrationOpen } from "@/server/registration-config";
import { getSession } from "@/server/session";
import { asSessionUser } from "@/server/context";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kurswerk – Kursverwaltung für Sprachschulen",
  description: "Kurswerk hält Einwahlen als unveränderliches Protokoll fest, schlägt die Anwesenheit vor und lässt die Lehrkraft bestätigen. Im Aufbau.",
  // Bis Impressum und Rechtstexte geprüft sind, soll die Seite nicht in Suchmaschinen auftauchen.
  robots: { index: false, follow: false },
};

// Beispiel für die Abbildung: erfundene Personen, ein Abendkurs von 18:00 bis 21:15 Uhr.
const SESSION = { start: new Date("2026-11-10T18:00:00+01:00"), end: new Date("2026-11-10T21:15:00+01:00") };
const at = (hhmm: string) => new Date(`2026-11-10T${hhmm}:00+01:00`);
const SAMPLE: { name: string; role?: string; parts: [string, string][] }[] = [
  { name: "Frau Beispiel", role: "Lehrkraft", parts: [["17:52", "21:15"]] },
  { name: "Teilnehmer 1", parts: [["17:58", "21:15"]] },
  { name: "Teilnehmerin 2", parts: [["18:01", "19:10"], ["19:14", "21:15"]] },
  { name: "Teilnehmer 3", parts: [["18:22", "21:15"]] },
  { name: "Teilnehmerin 4", parts: [["18:00", "19:32"]] },
  { name: "Teilnehmer 5", parts: [] },
];
const HOURS = ["18:00", "19:00", "20:00", "21:00"];
const pct = (hhmm: string) => ((at(hhmm).getTime() - SESSION.start.getTime()) / (SESSION.end.getTime() - SESSION.start.getTime())) * 100;

const POINTS = [
  { title: "Einwahlprotokoll mit Zeitleiste", text: "Jede Einwahl wird auf die Sekunde festgehalten. Daraus entsteht pro Termin ein Protokoll mit Zeitleiste, das du ausdrucken oder als PDF speichern kannst. Die Datenbank verhindert nachträgliche Änderungen." },
  { title: "Anwesenheit bestätigen statt abtippen", text: "Kurswerk schlägt die Anwesenheit aus der Einwahl vor. Die Lehrkraft prüft und bestätigt. Korrekturen brauchen eine Begründung und bleiben sichtbar." },
  { title: "Klassenbuch und Aufgaben im selben Raum", text: "Nach dem Unterricht trägt die Lehrkraft das Klassenbuch ein. Aufgaben stellen, abgeben und zurückgeben läuft im selben Kurs." },
  { title: "Mehrere Schulen, streng getrennt", text: "Jede Schule sieht nur ihre eigenen Daten. Das setzt die Datenbank selbst durch, nicht nur die Oberfläche." },
  { title: "BAMF-Funktionen nur, wenn du sie brauchst", text: "Bietest du keine geförderten Kurse an, bleiben Kursnummern und Nachweise ausgeblendet. Mit Förderung schaltest du sie in den Einstellungen ein. Kurswerk hat keine BAMF-Zulassung und ist nicht an BerD oder InGe angebunden." },
];

/** Startseite: für Angemeldete Weiterleitung in ihren Bereich, für alle anderen die Vorstellung von Kurswerk. */
export default async function Home() {
  if (await getSession()) {
    const role = await asSessionUser(async (tx, me) => (await tx.select().from(memberships).where(eq(memberships.id, me)))[0]?.role);
    redirect(role === "LEARNER" ? "/aufgaben" : role === "TEACHER" ? "/unterricht" : role === "ADMIN" || role === "STAFF" ? "/verwaltung/heute" : "/login");
  }
  const open = registrationOpen();
  return (
    <div className="land">
      <header className="land-top">
        <span className="brand">Kurswerk</span>
        <Link href="/login" className="land-login">Anmelden</Link>
      </header>
      <main>
        <section className="land-hero">
          <div className="land-copy">
            <h1>Anwesenheit, Protokoll und Klassenbuch an einem Ort.</h1>
            <p className="land-lead">Kurswerk hält Einwahlen als unveränderliches Protokoll fest, schlägt die Anwesenheit vor und lässt die Lehrkraft bestätigen. Für Sprachschulen und Kursträger.</p>
            <div className="land-cta">
              {open ? <Link href="/registrieren" className="btn">Schule 7 Tage kostenlos testen</Link> : <Link href="/login" className="btn">Anmelden</Link>}
              {open && <Link href="/login" className="btn ghostlink">Anmelden</Link>}
            </div>
            <p className="land-status">Stand heute: Die automatische Anbindung an die Videokonferenz fehlt noch. Einwahlen gibt es bisher nur als Beispieldaten.</p>
            {open && <p className="muted land-note">Nach den 7 Tagen bleiben deine Daten lesbar, Änderungen sind dann gesperrt. Wie es danach weitergeht (Freischaltung, Preis), steht noch nicht fest.</p>}
          </div>
          <figure className="land-proto" aria-label="Beispielprotokoll: ein Abendkurs von 18:00 bis 21:15 Uhr">
            <div className="land-axis" aria-hidden="true">
              {HOURS.map((h) => (
                <span key={h} style={{ left: `${pct(h)}%` }}>{h}</span>
              ))}
            </div>
            <ul className="land-rows">
              {SAMPLE.map((p) => (
                <li key={p.name}>
                  <span className="land-who">{p.name}{p.role && <small>{p.role}</small>}<span className="sr-only">{p.parts.length === 0 ? ": nicht eingewählt" : `: eingewählt ${p.parts.map(([a, b]) => `${a} bis ${b} Uhr`).join(" und ")}`}</span></span>
                  <span className="land-bar" aria-hidden="true">
                    {HOURS.slice(1).map((h) => <i key={h} className="land-grid" style={{ left: `${pct(h)}%` }} />)}
                    {timelineSegments(p.parts.map(([a, b]) => ({ start: at(a), end: at(b) })), SESSION)
                      .filter((s) => s.kind === "active")
                      .map((s, k) => <span key={k} className="tl-seg active" style={{ left: `${s.leftPct}%`, width: `${s.widthPct}%` }} />)}
                  </span>
                </li>
              ))}
            </ul>
            <figcaption className="muted">So sieht ein Protokoll aus. Blau heißt eingewählt. Die Personen sind erfunden.</figcaption>
          </figure>
        </section>
        <section className="land-points" aria-labelledby="land-points-title">
          <h2 id="land-points-title" className="sr-only">Was Kurswerk kann</h2>
          <dl>
            {POINTS.map((p) => (
              <div key={p.title}>
                <dt>{p.title}</dt>
                <dd>{p.text}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
      <footer className="land-foot muted">
        <span>Kurswerk ist im Aufbau.</span>
        <Link href="/datenschutz">Datenschutz</Link>
        <Link href="/nutzungsbedingungen">Nutzungsbedingungen</Link>
        <Link href="/impressum">Impressum</Link>
      </footer>
    </div>
  );
}
