"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import type { PersonOptions } from "@/lib/people/data";
import {
  createPassportShare,
  revokePassportShare,
} from "@/lib/passport/actions";
import { scopes, type ShareScope } from "@/lib/passport/model";

const fieldClass =
  "min-h-11 w-full rounded-md border border-slate-500 bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2";

const subscribe = () => () => {};

export function ShareForm({
  organisation,
  people,
}: {
  organisation: string;
  people: PersonOptions;
}) {
  const [state, action, pending] = useActionState(
    createPassportShare.bind(null, organisation),
    {},
  );
  const [scope, setScope] = useState<ShareScope>("all");
  const origin = useSyncExternalStore(
    subscribe,
    () => window.location.origin,
    () => "",
  );
  const link = origin && state.token ? `${origin}/share#${state.token}` : "";

  return (
    <form action={action} className="grid max-w-xl gap-4">
      <div className="grid gap-2">
        <label htmlFor="share-scope" className="text-sm font-semibold">
          Scope
        </label>
        <select
          id="share-scope"
          name="scope"
          className={fieldClass}
          value={scope}
          onChange={(event) => setScope(event.target.value as ShareScope)}
        >
          {Object.entries(scopes).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {scope === "people" && (
        <fieldset className="grid gap-3">
          <legend className="mb-2 text-sm font-semibold">
            People in scope
          </legend>
          {people.sponsored_worker_id.length +
          people.engaged_individual_id.length ? (
            <div className="grid max-h-48 gap-2 overflow-auto rounded-md border p-3">
              {(
                [
                  ["workers", "Sponsored worker", people.sponsored_worker_id],
                  [
                    "individuals",
                    "Engaged individual",
                    people.engaged_individual_id,
                  ],
                ] as const
              ).flatMap(([name, label, options]) =>
                options.map((person) => (
                  <label
                    key={`${name}-${person.id}`}
                    className="flex items-start gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      name={name}
                      value={person.id}
                      className="mt-1"
                    />
                    <span>
                      {person.full_name} · {person.reference} · {label}
                    </span>
                  </label>
                )),
              )}
            </div>
          ) : (
            <p className="text-sm">Add people in the People workspace first.</p>
          )}
          <p className="text-sm text-slate-700">
            Includes eligible ledger entries linked to the people selected here.
          </p>
        </fieldset>
      )}
      {scope === "dates" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <label htmlFor="share-from" className="text-sm font-semibold">
              From date
            </label>
            <input
              id="share-from"
              name="from"
              maxLength={10}
              placeholder="DD/MM/YYYY"
              className={fieldClass}
              required
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="share-through" className="text-sm font-semibold">
              Through date
            </label>
            <input
              id="share-through"
              name="through"
              maxLength={10}
              placeholder="DD/MM/YYYY"
              className={fieldClass}
              required
            />
          </div>
        </div>
      )}
      <div className="grid gap-2">
        <label htmlFor="share-expiry" className="text-sm font-semibold">
          Expiry date
        </label>
        <input
          id="share-expiry"
          name="expires"
          maxLength={10}
          className={fieldClass}
          aria-describedby="share-expiry-hint"
          required
        />
        <p id="share-expiry-hint" className="text-sm text-slate-700">
          DD/MM/YYYY. The link is available through that date in Europe/London.
        </p>
      </div>
      <div className="grid gap-2">
        <label htmlFor="share-passcode" className="text-sm font-semibold">
          Passcode (optional)
        </label>
        <input
          id="share-passcode"
          name="passcode"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          className={fieldClass}
          aria-describedby="share-passcode-hint"
        />
        <p id="share-passcode-hint" className="text-sm text-slate-700">
          Use at least eight characters. Share the passcode separately.
        </p>
      </div>
      {state.error && (
        <p role="alert" className="text-sm font-medium text-red-900">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Creating…" : "Create share link"}
      </Button>
      {link && (
        <div className="grid gap-2 rounded-md bg-slate-100 p-3">
          <p role="status" className="text-sm font-semibold">
            Link created. Copy it before leaving this page.
          </p>
          <label htmlFor="new-share-link" className="text-sm font-semibold">
            New share link
          </label>
          <input
            id="new-share-link"
            className={fieldClass}
            value={link}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
      )}
    </form>
  );
}

export function RevokeShare({
  organisation,
  id,
}: {
  organisation: string;
  id: string;
}) {
  const [state, action, pending] = useActionState(
    revokePassportShare.bind(null, organisation, id),
    {},
  );
  return (
    <form action={action} className="grid justify-items-start gap-2">
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Revoking…" : "Revoke link"}
      </Button>
      {state.error && (
        <p role="alert" className="text-sm text-red-900">
          {state.error}
        </p>
      )}
    </form>
  );
}
