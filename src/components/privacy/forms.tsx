"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { formatUkDate } from "@/lib/dates";
import {
  erasePerson,
  savePersonControls,
  savePrivacyRule,
} from "@/lib/privacy/actions";
import { personKinds, type PersonKind } from "@/lib/privacy/model";

const input = "min-h-10 rounded-md border border-slate-500 bg-white px-3";
const label = "grid gap-1 text-sm font-medium";

function Feedback({ state }: { state: { error?: string; message?: string } }) {
  return (
    <>
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
    </>
  );
}

export function RetentionRuleForm({ organisation }: { organisation: string }) {
  const [state, action, pending] = useActionState(
    savePrivacyRule.bind(null, organisation),
    {},
  );
  return (
    <form action={action} className="grid max-w-xl gap-3">
      <label className={label}>
        Person type
        <select name="kind" className={input}>
          {Object.entries(personKinds).map(([kind, name]) => (
            <option value={kind} key={kind}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        Effective from (DD/MM/YYYY)
        <input name="effective" maxLength={10} required className={input} />
      </label>
      <label className={label}>
        Retention period (calendar days)
        <input
          type="number"
          name="days"
          min={1}
          max={36500}
          className={input}
          aria-describedby="retention-days"
        />
      </label>
      <p id="retention-days" className="text-sm">
        Leave blank to pause automatic purging for this person type.
      </p>
      <label className={label}>
        Source or approved policy reference
        <input name="source" maxLength={250} required className={input} />
      </label>
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Saving…" : "Add retention version"}
      </Button>
      <Feedback state={state} />
    </form>
  );
}

export function PersonPrivacyControls({
  organisation,
  person,
}: {
  organisation: string;
  person: {
    kind: PersonKind;
    id: string;
    started_on: string | null;
    held: boolean;
  };
}) {
  const [save, saveAction, saving] = useActionState(
    savePersonControls.bind(null, organisation, person.kind, person.id),
    {},
  );
  const [erase, eraseAction, erasing] = useActionState(
    erasePerson.bind(null, organisation, person.kind, person.id),
    {},
  );
  return (
    <div className="grid gap-5">
      <form action={saveAction} className="grid max-w-xl gap-3">
        <label className={label}>
          Retention start date (DD/MM/YYYY)
          <input
            name="started"
            defaultValue={
              person.started_on ? formatUkDate(person.started_on) : ""
            }
            maxLength={10}
            className={input}
            aria-describedby="retention-start"
          />
        </label>
        <p id="retention-start" className="text-sm">
          Leave blank to exclude this record from scheduled purging.
        </p>
        <label className="flex gap-2 text-sm font-medium">
          <input type="checkbox" name="held" defaultChecked={person.held} />{" "}
          Hold erasure
        </label>
        <Button
          type="submit"
          disabled={saving}
          variant="outline"
          className="justify-self-start"
        >
          Save person retention
        </Button>
        <Feedback state={save} />
      </form>
      <form action={eraseAction} className="grid max-w-xl gap-3 border-t pt-4">
        <h3 className="font-semibold">Erase person data</h3>
        <p className="text-sm">
          This permanently removes the person and linked records, queues file
          deletion, and invalidates earlier audit packs for this organisation.
        </p>
        <label className={label}>
          Type ERASE to confirm
          <input
            name="confirmation"
            required
            pattern="ERASE"
            autoComplete="off"
            className={input}
          />
        </label>
        <Button
          type="submit"
          disabled={erasing || person.held}
          variant="destructive"
          className="justify-self-start"
        >
          Erase person data
        </Button>
        <Feedback state={erase} />
      </form>
    </div>
  );
}
