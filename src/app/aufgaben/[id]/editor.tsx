"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveDraftAction, submitAction } from "@/app/actions";

type Props = { assignmentId: string; initialText: string; locked: boolean };

export function Editor({ assignmentId, initialText, locked }: Props) {
  const router = useRouter();
  const [text, setText] = useState(initialText);
  const [state, setState] = useState<"saved" | "saving" | "error">("saved");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirty = useRef(false);

  useEffect(() => {
    if (!dirty.current || locked) return;
    setState("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await saveDraftAction(assignmentId, text);
      setState(r.ok ? "saved" : "error");
      if (!r.ok) setMessage(r.message);
    }, 800);
    return () => clearTimeout(timer.current);
  }, [text, assignmentId, locked]);

  const words = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;

  function submit() {
    clearTimeout(timer.current);
    start(async () => {
      const r = await submitAction(assignmentId, text);
      if (r.ok) {
        dirty.current = false;
        setMessage("");
        router.refresh();
      } else {
        setState("error");
        setMessage(r.message);
      }
    });
  }

  return (
    <div>
      <textarea
        value={text}
        disabled={locked}
        onChange={(e) => {
          dirty.current = true;
          setText(e.target.value);
        }}
        placeholder="Schreibe hier deinen Text …"
        aria-label="Dein Text"
      />
      <div className="row" style={{ marginTop: 12 }}>
        <span className="muted">
          {words} Wörter · {locked ? "Liegt bei der Lehrkraft" : state === "saving" ? "Speichert …" : state === "error" ? "Nicht gespeichert" : "Entwurf gespeichert"}
        </span>
        {!locked && (
          <button type="button" onClick={submit} disabled={pending || text.trim() === ""}>
            Bei der Lehrkraft abgeben
          </button>
        )}
      </div>
      {message && <p role="alert" style={{ color: "#B42318" }}>{message}</p>}
    </div>
  );
}
