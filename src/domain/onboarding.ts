// Einstieg für neue Schulen: die ersten Schritte bis zum ersten Unterricht.
// Reine Fachregel ohne Datenbank: aus Zählwerten wird die Checkliste.

export type OnboardingCounts = {
  courses: number;
  /** Lehrkräfte, die eingeladen sind oder schon Zugang haben. */
  teachersWithAccess: number;
  /** Teilnehmende, die eingeladen sind oder schon Zugang haben. */
  learnersWithAccess: number;
};

export type OnboardingStep = { key: "course" | "teacher" | "learners"; title: string; text: string; href: string; action: string; done: boolean };

export type Onboarding = { steps: OnboardingStep[]; doneCount: number; complete: boolean };

export function onboardingFrom(c: OnboardingCounts): Onboarding {
  const steps: OnboardingStep[] = [
    {
      key: "course",
      title: "Ersten Kurs anlegen",
      text: "Der Assistent fragt Zeitraum, Unterrichtstage, Lehrkraft und Teilnehmende ab und legt alle Termine an.",
      href: "/verwaltung/kurse/neu",
      action: "Kurs anlegen",
      done: c.courses > 0,
    },
    {
      key: "teacher",
      title: "Lehrkraft Zugang geben",
      text: "Erzeuge für die Lehrkraft einen Einladungslink. Sie legt damit ihr eigenes Passwort fest.",
      href: "/verwaltung/personen",
      action: "Zu den Personen",
      done: c.teachersWithAccess > 0,
    },
    {
      key: "learners",
      title: "Teilnehmende einladen",
      text: "Auch Teilnehmende bekommen einen Link. Danach sehen sie ihre Aufgaben und geben Texte ab.",
      href: "/verwaltung/personen",
      action: "Zu den Personen",
      done: c.learnersWithAccess > 0,
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  return { steps, doneCount, complete: doneCount === steps.length };
}
