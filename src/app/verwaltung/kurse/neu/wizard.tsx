"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCourseAction } from "@/app/actions";
import { checkPlan, COURSE_TYPE_SUGGESTIONS, expandPlan, WEEKDAY_LABELS, type Weekday, type WeeklyPlan } from "@/domain/course-plan";

type Person = { membershipId: string; firstName: string; lastName: string; email: string };
type NewLearner = { key: number; firstName: string; lastName: string; email: string; bamfFunded: boolean };

const STEPS = ["Kursdaten", "Termine", "Lehrkraft", "Teilnehmende"] as const;
const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];
const monthFmt = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });
const dayFmt = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" });

export function CourseWizard({ teachers, learners }: { teachers: Person[]; learners: Person[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [bamfNo, setBamfNo] = useState("");
  const [plan, setPlan] = useState<WeeklyPlan>({ startDate: "", endDate: "", weekdays: [1, 2, 3, 4, 5], startTime: "08:30", endTime: "11:45", ue: 4, mode: "VIRTUAL" });
  const [excluded, setExcluded] = useState<string[]>([]);
  const [teacherIds, setTeacherIds] = useState<string[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({}); // membershipId -> BAMF gefördert
  const [newLearners, setNewLearners] = useState<NewLearner[]>([]);
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();

  const check = useMemo(() => checkPlan(plan), [plan]);
  const dates = useMemo(() => (check.errors.length ? [] : expandPlan(plan, [])), [plan, check]);
  const active = dates.filter((d) => !excluded.includes(d.day));

  const stepErrors: string[] = [
    [!name.trim() && "Bitte einen Kursnamen angeben.", !category.trim() && "Bitte eine Kursart angeben.", (!plan.startDate || !plan.endDate) && "Bitte Beginn und Ende angeben.", plan.startDate && plan.endDate && plan.endDate < plan.startDate && "Das Kursende liegt vor dem Kursbeginn."],
    [...check.errors, dates.length > 0 && active.length === 0 && "Alle Termine wurden entfernt."],
    [teacherIds.length === 0 && "Bitte mindestens eine Lehrkraft wählen."],
    [],
  ][step]!.filter((x): x is string => typeof x === "string");

  const setP = <K extends keyof WeeklyPlan>(k: K, v: WeeklyPlan[K]) => {
    setPlan((p) => ({ ...p, [k]: v }));
    if (k !== "ue" && k !== "mode") setExcluded([]);
  };

  const pickedCount = Object.keys(picked).length + newLearners.length;
  const shown = learners.filter((l) => `${l.firstName} ${l.lastName} ${l.email}`.toLowerCase().includes(filter.toLowerCase()));

  function submit() {
    setMessage("");
    start(async () => {
      const r = await createCourseAction({
        name,
        category,
        bamfCourseNumber: bamfNo,
        plan,
        excludedDays: excluded,
        teacherIds,
        learners: Object.entries(picked).map(([membershipId, bamfFunded]) => ({ membershipId, bamfFunded })),
        newLearners: newLearners.map(({ firstName, lastName, email, bamfFunded }) => ({ firstName, lastName, email, bamfFunded })),
      });
      if (r.ok) router.push(`/verwaltung?neu=${r.courseId}`);
      else setMessage(r.message);
    });
  }

  const byMonth = new Map<string, typeof dates>();
  for (const d of dates) {
    const k = monthFmt.format(new Date(`${d.day}T12:00:00Z`));
    byMonth.set(k, [...(byMonth.get(k) ?? []), d]);
  }

  return (
    <div>
      <ol className="steps" aria-label="Fortschritt">
        {STEPS.map((s, i) => (
          <li key={s} className={i < step ? "done" : i === step ? "now" : ""} aria-current={i === step ? "step" : undefined}>
            <b>Schritt {i + 1}</b>
            {s}
          </li>
        ))}
      </ol>

      <div className="card">
        {step === 0 && (
          <>
            <label htmlFor="name">Kursname</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. BSK B2 Vormittag Herbst" />
            <div className="grid2">
              <div>
                <label htmlFor="category">Kursart</label>
                <input id="category" list="course-types" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="frei wählbar" />
                <datalist id="course-types">{COURSE_TYPE_SUGGESTIONS.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
              <div>
                <label htmlFor="bamf">BAMF-Kursnummer (optional)</label>
                <input id="bamf" value={bamfNo} onChange={(e) => setBamfNo(e.target.value)} placeholder="z. B. 2026-06552" />
              </div>
            </div>
            <div className="grid3">
              <div>
                <label htmlFor="start">Kursbeginn</label>
                <input id="start" type="date" value={plan.startDate} onChange={(e) => setP("startDate", e.target.value)} />
              </div>
              <div>
                <label htmlFor="end">Kursende</label>
                <input id="end" type="date" value={plan.endDate} onChange={(e) => setP("endDate", e.target.value)} />
              </div>
              <div>
                <label>Unterrichtsform</label>
                <div className="toggles">
                  {(["VIRTUAL", "PRESENCE"] as const).map((m) => (
                    <button key={m} type="button" className={`toggle ${plan.mode === m ? "on" : ""}`} aria-pressed={plan.mode === m} onClick={() => setP("mode", m)}>
                      {m === "VIRTUAL" ? "Online" : "Präsenz"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <label>Unterrichtstage (jede Woche gleich)</label>
            <div className="toggles">
              {WEEKDAYS.map((w) => {
                const on = plan.weekdays.includes(w);
                return (
                  <button key={w} type="button" className={`toggle ${on ? "on" : ""}`} aria-pressed={on} onClick={() => setP("weekdays", on ? plan.weekdays.filter((x) => x !== w) : [...plan.weekdays, w].sort())}>
                    {WEEKDAY_LABELS[w]}
                  </button>
                );
              })}
            </div>
            <div className="grid3">
              <div>
                <label htmlFor="from">Beginn</label>
                <input id="from" type="time" value={plan.startTime} onChange={(e) => setP("startTime", e.target.value)} />
              </div>
              <div>
                <label htmlFor="to">Ende</label>
                <input id="to" type="time" value={plan.endTime} onChange={(e) => setP("endTime", e.target.value)} />
              </div>
              <div>
                <label htmlFor="ue">Unterrichtseinheiten je Termin</label>
                <input id="ue" type="number" min={1} max={12} value={plan.ue} onChange={(e) => setP("ue", Number(e.target.value))} />
              </div>
            </div>
            {check.warnings.map((w) => <div key={w} className="warn">{w}</div>)}
            {dates.length > 0 && (
              <>
                <p className="muted" style={{ marginTop: 20 }}>
                  <b style={{ color: "var(--ink)" }}>{active.length} Termine</b>. Ferien oder Ausfalltage anklicken, um sie herauszunehmen.
                </p>
                {[...byMonth].map(([month, ds]) => (
                  <div key={month}>
                    <div className="month">{month}</div>
                    <div className="datechips">
                      {ds.map((d) => {
                        const off = excluded.includes(d.day);
                        return (
                          <button key={d.day} type="button" className={`datechip ${off ? "off" : ""}`} aria-pressed={!off} title={off ? "Wieder aufnehmen" : "Herausnehmen"} onClick={() => setExcluded((x) => (off ? x.filter((y) => y !== d.day) : [...x, d.day]))}>
                            {dayFmt.format(new Date(`${d.day}T12:00:00Z`))}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <p className="muted" style={{ marginTop: 0 }}>Mindestens eine Lehrkraft; weitere zum Beispiel für Vertretungen.</p>
            {teachers.length === 0 && <div className="warn">An dieser Schule gibt es noch keine Lehrkräfte.</div>}
            {teachers.map((t) => {
              const on = teacherIds.includes(t.membershipId);
              return (
                <label key={t.membershipId} className="person" style={{ margin: 0, fontSize: 16 }}>
                  <input type="checkbox" checked={on} onChange={() => setTeacherIds((x) => (on ? x.filter((y) => y !== t.membershipId) : [...x, t.membershipId]))} />
                  <span className="grow">{t.firstName} {t.lastName}</span>
                  <span className="muted">{t.email}</span>
                </label>
              );
            })}
          </>
        )}

        {step === 3 && (
          <>
            <div className="row">
              <p className="muted" style={{ margin: 0 }}>{pickedCount} ausgewählt</p>
              <input aria-label="Teilnehmende suchen" placeholder="Suchen …" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 280 }} />
            </div>
            {shown.map((l) => {
              const on = l.membershipId in picked;
              return (
                <div key={l.membershipId} className="person">
                  <input type="checkbox" id={`l-${l.membershipId}`} checked={on} onChange={() => setPicked((x) => { const n = { ...x }; if (on) delete n[l.membershipId]; else n[l.membershipId] = false; return n; })} />
                  <label htmlFor={`l-${l.membershipId}`} className="grow" style={{ margin: 0, fontSize: 16 }}>{l.firstName} {l.lastName} <span className="muted">· {l.email}</span></label>
                  {on && (
                    <label className="muted" style={{ margin: 0, display: "flex", gap: 6, alignItems: "center" }}>
                      <input type="checkbox" checked={picked[l.membershipId]} onChange={(e) => setPicked((x) => ({ ...x, [l.membershipId]: e.target.checked }))} style={{ width: 16, height: 16 }} /> BAMF
                    </label>
                  )}
                </div>
              );
            })}
            <p style={{ marginTop: 20, marginBottom: 4 }}><strong>Neue Teilnehmende</strong></p>
            {newLearners.map((n) => {
              const upd = (k: keyof NewLearner, v: string | boolean) => setNewLearners((x) => x.map((y) => (y.key === n.key ? { ...y, [k]: v } : y)));
              return (
                <div key={n.key} className="person" style={{ flexWrap: "wrap" }}>
                  <input aria-label="Vorname" placeholder="Vorname" value={n.firstName} onChange={(e) => upd("firstName", e.target.value)} style={{ flex: "1 1 140px" }} />
                  <input aria-label="Nachname" placeholder="Nachname" value={n.lastName} onChange={(e) => upd("lastName", e.target.value)} style={{ flex: "1 1 140px" }} />
                  <input aria-label="E-Mail" type="email" placeholder="E-Mail" value={n.email} onChange={(e) => upd("email", e.target.value)} style={{ flex: "2 1 200px" }} />
                  <label className="muted" style={{ margin: 0, display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="checkbox" checked={n.bamfFunded} onChange={(e) => upd("bamfFunded", e.target.checked)} style={{ width: 16, height: 16 }} /> BAMF
                  </label>
                  <button type="button" className="ghost" onClick={() => setNewLearners((x) => x.filter((y) => y.key !== n.key))}>Entfernen</button>
                </div>
              );
            })}
            <button type="button" className="ghost" style={{ marginTop: 8 }} onClick={() => setNewLearners((x) => [...x, { key: Date.now(), firstName: "", lastName: "", email: "", bamfFunded: false }])}>
              + Neue Person hinzufügen
            </button>

            <dl className="summary" style={{ marginTop: 24, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
              <dt>Zusammenfassung</dt>
              <dd>
                <strong>{name || "Ohne Namen"}</strong> · {category} {bamfNo && `· BAMF ${bamfNo}`} · {plan.mode === "VIRTUAL" ? "online" : "Präsenz"}
              </dd>
              <dd>
                {active.length} Termine, {plan.weekdays.map((w) => WEEKDAY_LABELS[w]).join(", ")} {plan.startTime}–{plan.endTime} Uhr, {plan.ue} UE · {teacherIds.length} Lehrkraft · {pickedCount} Teilnehmende
              </dd>
            </dl>
          </>
        )}

        {stepErrors.length > 0 && step < 3 && (step > 0 || name || category || plan.startDate) && <div className="err">{stepErrors.join(" ")}</div>}
        {message && <div className="err" role="alert">{message}</div>}

        <div className="actions">
          <button type="button" className="ghost" onClick={() => (step === 0 ? router.push("/verwaltung") : setStep(step - 1))}>
            {step === 0 ? "Abbrechen" : "Zurück"}
          </button>
          {step < 3 ? (
            <button type="button" disabled={stepErrors.length > 0} onClick={() => setStep(step + 1)}>Weiter</button>
          ) : (
            <button type="button" disabled={pending} onClick={submit}>{pending ? "Wird angelegt …" : "Kurs anlegen"}</button>
          )}
        </div>
      </div>
    </div>
  );
}
