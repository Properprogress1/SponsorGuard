"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { formatUkDate } from "@/lib/dates";
import { savePersonnel, setHandoverStep } from "@/lib/key-personnel/actions";
import {
  handoverSteps,
  personnelRoles,
  smsMfa,
  type Person,
} from "@/lib/key-personnel/model";

const inputClass =
  "min-h-11 rounded-md border border-slate-500 bg-white px-3 py-2";

export function PersonnelForm({
  organisation,
  person,
}: {
  organisation: string;
  person?: Person;
}) {
  const [state, action, pending] = useActionState(
    savePersonnel.bind(null, organisation, person?.id ?? null),
    {},
  );
  const id = useId();
  return (
    <form action={action} className="grid max-w-xl gap-4">
      <label className="grid gap-1 text-sm font-medium">
        Name (self-reported)
        <input
          name="name"
          defaultValue={person?.full_name}
          required
          maxLength={120}
          className={inputClass}
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Role (self-reported)
        <select
          name="role"
          defaultValue={person?.role ?? ""}
          required
          className={inputClass}
        >
          <option value="">Choose a role</option>
          {person && !personnelRoles.some((role) => role === person.role) && (
            <option value={person.role} disabled>
              {person.role} (choose a supported role to save)
            </option>
          )}
          {personnelRoles.map((role) => (
            <option key={role}>{role}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium">
        SMS MFA status (self-reported)
        <select
          name="mfa"
          defaultValue={person?.sms_mfa ?? "unknown"}
          className={inputClass}
        >
          {Object.entries(smsMfa).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Last SMS login date (self-reported)
        <input
          name="login"
          maxLength={10}
          aria-describedby={id}
          defaultValue={
            person?.sms_last_login_on
              ? formatUkDate(person.sms_last_login_on)
              : ""
          }
          className={inputClass}
        />
        <span id={id} className="font-normal text-slate-700">
          DD/MM/YYYY. Leave blank if unknown.
        </span>
      </label>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          name="leaving"
          defaultChecked={person?.leaving}
        />
        Leaving (self-reported)
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-red-900">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="text-sm">
          {state.success}
        </p>
      )}
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Saving…" : person ? "Save changes" : "Add key person"}
      </Button>
    </form>
  );
}

export function HandoverTaskToggle({
  organisation,
  person,
  step,
  completed,
}: {
  organisation: string;
  person: string;
  step: keyof typeof handoverSteps;
  completed: boolean;
}) {
  const [state, action, pending] = useActionState(
    setHandoverStep.bind(null, organisation, person, step, !completed),
    {},
  );
  return (
    <form action={action} className="grid gap-1">
      <Button
        size="sm"
        variant="outline"
        type="submit"
        disabled={pending}
        aria-label={`${completed ? "Reopen" : "Complete"} task: ${handoverSteps[step]}`}
      >
        {completed ? "Reopen task" : "Complete task"}
      </Button>
      {state.error && (
        <p role="alert" className="text-sm text-red-900">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="text-sm">
          {state.success}
        </p>
      )}
    </form>
  );
}
