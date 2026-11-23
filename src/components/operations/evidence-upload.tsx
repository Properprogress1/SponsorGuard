"use client";

import { useActionState, useSyncExternalStore } from "react";
import { submitEvidence } from "@/lib/operations/evidence-actions";
import { Button } from "@/components/ui/button";
import { ResultMessage } from "./feedback";

function subscribe(notify: () => void) {
  window.addEventListener("hashchange", notify);
  return () => window.removeEventListener("hashchange", notify);
}

export function EvidenceUpload() {
  const token = useSyncExternalStore(
    subscribe,
    () => window.location.hash.slice(1),
    () => null,
  );
  const [state, action, pending] = useActionState(submitEvidence, {});
  if (token === null) return <p>Opening the upload request…</p>;
  if (!/^[a-zA-Z0-9_-]{43}$/.test(token))
    return <p role="alert">This upload link is unavailable.</p>;
  return (
    <>
      {!state.message && (
        <form action={action} className="grid gap-4">
          <input type="hidden" name="token" value={token} />
          <label className="grid gap-2">
            Evidence file (PDF, JPEG or PNG, up to 4 MiB)
            <input
              type="file"
              name="file"
              accept=".pdf,.jpg,.jpeg,.png"
              required
            />
          </label>
          <Button type="submit" disabled={pending}>
            {pending ? "Checking file…" : "Submit file"}
          </Button>
        </form>
      )}
      <ResultMessage result={state} />
    </>
  );
}
