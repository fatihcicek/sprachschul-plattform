"use client";

import { useState, useTransition } from "react";
import { inviteAction } from "@/app/actions";

const fmt = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });

export function InviteButton({ membershipId, label }: { membershipId: string; label: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ link: string; expiresAt: string } | { message: string } | null>(null);
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ flexBasis: "100%" }}>
      <button type="button" className="ghost" disabled={pending} onClick={() => start(async () => {
        const r = await inviteAction(membershipId);
        setCopied(false);
        setResult(r.ok ? { link: r.link, expiresAt: r.expiresAt } : { message: r.message });
      })}>{pending ? "Erzeuge …" : label}</button>
      {result && "message" in result && <div className="err" role="alert">{result.message}</div>}
      {result && "link" in result && (
        <div className="warn" role="status">
          <div>Dieser Link wird nur jetzt angezeigt und gilt bis {fmt.format(new Date(result.expiresAt))}, einmalig. Gib ihn nur der Person selbst.</div>
          <input readOnly value={result.link} onFocus={(e) => e.currentTarget.select()} aria-label="Einladungslink" style={{ marginTop: 8 }} />
          <button type="button" style={{ marginTop: 8 }} onClick={async () => { await navigator.clipboard.writeText(result.link); setCopied(true); }}>
            {copied ? "Kopiert" : "Link kopieren"}
          </button>
        </div>
      )}
    </div>
  );
}
