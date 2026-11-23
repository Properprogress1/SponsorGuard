"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { saveNotificationPreferences } from "@/lib/notifications/actions";
import { topics, type Preferences } from "@/lib/notifications/preferences";

export function PreferencesForm({
  organisation,
  initial,
}: {
  organisation: string;
  initial: Preferences;
}) {
  const [state, action, pending] = useActionState(
    saveNotificationPreferences.bind(null, organisation),
    {},
  );
  const [preferences, setPreferences] = useState(initial);
  const choices = {
    enabled: "Send me a daily records digest by email",
    ...topics,
  };
  return (
    <form action={action} className="max-w-lg rounded-md border bg-white p-5">
      <fieldset className="grid gap-3">
        <legend className="mb-3 text-lg font-semibold">Email digest</legend>
        <p className="text-sm text-slate-700">
          These preferences apply to your account across all workspaces.
        </p>
        {Object.entries(choices).map(([name, label]) => {
          const key = name as keyof Preferences;
          return (
            <label key={name} className="flex items-center gap-2 text-sm">
              <input
                name={name}
                type="checkbox"
                checked={preferences[key]}
                onChange={(event) =>
                  setPreferences({
                    ...preferences,
                    [key]: event.target.checked,
                  })
                }
              />
              {label}
            </label>
          );
        })}
        <Button type="submit" disabled={pending} className="justify-self-start">
          {pending ? "Saving…" : "Save preferences"}
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
      </fieldset>
    </form>
  );
}
