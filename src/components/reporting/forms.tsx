"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatUkDate, parseUkDate } from "@/lib/dates";
import {
  recordReportingEvent,
  setReportingTaskCompletion,
} from "@/lib/reporting/actions";
import { rulesForDate, type ReportingRule } from "@/lib/reporting/model";

const fieldClass =
  "min-h-11 w-full rounded-md border border-slate-500 bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2";
const errorClass = "text-sm font-medium text-red-900";

export function ReportingEventForm({
  organisation,
  today,
  rules,
}: {
  organisation: string;
  today: string;
  rules: ReportingRule[];
}) {
  const [state, action, pending] = useActionState(
    recordReportingEvent.bind(null, organisation),
    {},
  );
  const [eventOn, setEventOn] = useState(formatUkDate(today));
  const [ruleKey, setRuleKey] = useState("");
  const date = parseUkDate(eventOn.trim());
  const options = date ? rulesForDate(rules, date) : [];
  const selected = options.find((rule) => rule.key === ruleKey);

  return (
    <section
      className="max-w-2xl rounded-lg border bg-white p-5"
      aria-labelledby="record-event"
    >
      <h2 id="record-event" className="mb-4 text-lg font-semibold">
        Record a reporting event
      </h2>
      <form action={action} className="grid gap-4">
        <div className="grid gap-2">
          <label htmlFor="event-on" className="text-sm font-semibold">
            Event date
          </label>
          <input
            id="event-on"
            type="text"
            name="eventOn"
            required
            value={eventOn}
            maxLength={10}
            onChange={(event) => setEventOn(event.target.value)}
            className={fieldClass}
            autoComplete="off"
            aria-describedby="event-date-hint"
          />
          <p id="event-date-hint" className="text-sm text-slate-700">
            Use DD/MM/YYYY. The event date determines which rule version
            applies.
          </p>
        </div>
        <div className="grid gap-2">
          <label htmlFor="reporting-rule" className="text-sm font-semibold">
            Reporting rule
          </label>
          <select
            id="reporting-rule"
            name="rule"
            required
            value={selected?.key ?? ""}
            onChange={(event) => setRuleKey(event.target.value)}
            className={fieldClass}
            aria-describedby="rule-hint"
          >
            <option value="">Choose a rule</option>
            {options.map((rule) => (
              <option key={rule.key} value={rule.key}>
                {rule.description} (v{rule.version})
                {rule.requires_verification ? " · VERIFY" : ""}
              </option>
            ))}
          </select>
          <p id="rule-hint" className="text-sm text-slate-700">
            {!date
              ? "Enter a valid date to see available rules."
              : !options.length
                ? "No rules are effective on that date."
                : "Verify sample rules against current Home Office guidance before relying on a deadline."}
          </p>
        </div>
        {state.error && (
          <p className={errorClass} role="alert">
            {state.error}
          </p>
        )}
        {state.success && (
          <p className="text-sm font-medium text-emerald-900" role="status">
            {state.success}
          </p>
        )}
        <Button
          type="submit"
          disabled={pending || !options.length}
          className="justify-self-start"
        >
          {pending ? "Recording…" : "Record event"}
        </Button>
      </form>
    </section>
  );
}

export function TaskCompletionForm({
  organisation,
  taskId,
  completed,
}: {
  organisation: string;
  taskId: string;
  completed: boolean;
}) {
  const [state, action, pending] = useActionState(
    setReportingTaskCompletion.bind(null, organisation, taskId, !completed),
    {},
  );
  return (
    <form action={action} className="grid justify-items-start gap-2">
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Saving…" : completed ? "Reopen task" : "Mark complete"}
      </Button>
      {state.error && (
        <p className={errorClass} role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
