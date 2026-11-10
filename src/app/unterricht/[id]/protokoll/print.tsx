"use client";

export function PrintButton() {
  return <button type="button" onClick={() => window.print()}>Drucken oder als PDF speichern</button>;
}
