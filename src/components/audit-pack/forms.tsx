"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { queueAuditPack, saveAuditChecklist } from "@/lib/audit-pack/actions";

export function QueueAuditPack({
  organisation,
  running,
}: {
  organisation: string;
  running: boolean;
}) {
  const [state, submit, pending] = useActionState(
    queueAuditPack.bind(null, organisation),
    {},
  );
  const router = useRouter();
  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => router.refresh(), 15_000);
    return () => window.clearInterval(interval);
  }, [router, running]);

  return (
    <form action={submit} className="grid gap-2">
      <Button
        type="submit"
        disabled={pending || running}
        className="justify-self-start"
      >
        {pending ? "Queuing…" : "Generate audit pack"}
      </Button>
      {state.error && (
        <p role="alert" className="text-sm text-red-900">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-sm">
          {state.message}
        </p>
      )}
    </form>
  );
}

export function ChecklistForm({
  organisation,
  initial,
}: {
  organisation: string;
  initial: string[];
}) {
  const [state, submit, pending] = useActionState(
    saveAuditChecklist.bind(null, organisation),
    {},
  );
  const [value, setValue] = useState(initial.join("\n"));
  return (
    <form action={submit} className="grid max-w-xl gap-2">
      <label htmlFor="audit-checklist" className="font-medium">
        Checklist items
      </label>
      <p id="audit-checklist-help" className="text-sm text-slate-700">
        Enter one item per line. Packs use the saved order. Leave blank to omit
        the checklist.
      </p>
      <textarea
        id="audit-checklist"
        name="checklist"
        rows={6}
        maxLength={3630}
        className="rounded-md border border-slate-500 bg-white p-2"
        aria-describedby="audit-checklist-help"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        className="justify-self-start"
      >
        {pending ? "Saving…" : "Save checklist"}
      </Button>
      {state.error && (
        <p role="alert" className="text-sm text-red-900">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-sm">
          {state.message}
        </p>
      )}
    </form>
  );
}
