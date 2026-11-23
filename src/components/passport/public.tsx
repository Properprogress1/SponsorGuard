"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { Button } from "@/components/ui/button";
import { readPassportShare } from "@/lib/passport/actions";
import {
  londonTime,
  recordLabels,
  sharePageSize,
  type PublicShareResult,
} from "@/lib/passport/model";

function subscribeToFragment(notify: () => void) {
  window.addEventListener("hashchange", notify);
  return () => window.removeEventListener("hashchange", notify);
}

export function PublicPassport() {
  const token = useSyncExternalStore(
    subscribeToFragment,
    () => window.location.hash.slice(1),
    () => null,
  );
  if (token === null) return <p role="status">Opening shared Passport…</p>;
  return <PassportEntries key={token} token={token} />;
}

function PassportEntries({ token }: { token: string }) {
  const [result, setResult] = useState<PublicShareResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [offset, setOffset] = useState(0);
  const initial = useRef<Promise<PublicShareResult> | null>(null);
  const passcode = useRef<string | undefined>(undefined);

  useEffect(() => {
    initial.current ??= readPassportShare(token);
    let active = true;
    void initial.current.then(
      (response) => {
        if (active) setResult(response);
      },
      () => {
        if (active) setResult({ status: "unavailable" });
      },
    );
    return () => {
      active = false;
    };
  }, [token]);

  function open(next: number) {
    startTransition(async () => {
      try {
        const response = await readPassportShare(token, passcode.current, next);
        if (response.status !== "open") passcode.current = undefined;
        setOffset(next);
        setResult(response);
      } catch {
        setResult({ status: "unavailable" });
      }
    });
  }

  if (!result) return <p role="status">Opening shared Passport…</p>;
  if (result.status === "unavailable")
    return <p role="alert">This share link is unavailable.</p>;
  if (result.status === "rate_limited")
    return (
      <p role="alert">
        Too many requests or the service is unavailable. Try again shortly.
      </p>
    );
  if (result.status === "locked")
    return (
      <p role="alert">Too many passcode attempts. Try again in 15 minutes.</p>
    );
  if (result.status !== "open") {
    return (
      <form
        className="grid max-w-sm gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          passcode.current = String(
            new FormData(event.currentTarget).get("passcode") ?? "",
          );
          open(0);
        }}
      >
        <label htmlFor="public-passcode" className="text-sm font-semibold">
          Passcode
        </label>
        <input
          id="public-passcode"
          name="passcode"
          type="password"
          required
          maxLength={128}
          autoComplete="off"
          className="min-h-11 rounded-md border border-slate-500 px-3 focus-visible:outline-2 focus-visible:outline-offset-2"
        />
        {result.status === "incorrect" && (
          <p role="alert" className="text-sm text-red-900">
            The passcode was incorrect.
          </p>
        )}
        <Button type="submit" disabled={pending} className="justify-self-start">
          {pending ? "Checking…" : "Open Passport"}
        </Button>
      </form>
    );
  }

  return (
    <section className="grid gap-4" aria-labelledby="shared-entries">
      <h2 id="shared-entries" className="text-xl font-semibold">
        Shared ledger entries
      </h2>
      {result.entries.length ? (
        <ul className="divide-y rounded-md border bg-white">
          {result.entries.map((entry, index) => (
            <li
              className="flex flex-wrap justify-between gap-2 p-4 text-sm"
              key={index}
            >
              <p>
                <strong>{recordLabels[entry.record_type]}</strong> ·{" "}
                {entry.operation}
              </p>
              <time dateTime={entry.created_at}>
                {londonTime(entry.created_at)}
              </time>
            </li>
          ))}
        </ul>
      ) : (
        <p>No entries are available in this view.</p>
      )}
      {(offset > 0 || result.has_more) && (
        <nav aria-label="Shared entry pages" className="flex flex-wrap gap-3">
          {offset > 0 && (
            <Button
              variant="outline"
              onClick={() => open(offset - sharePageSize)}
              disabled={pending}
            >
              Previous entries
            </Button>
          )}
          {result.has_more && (
            <Button
              variant="outline"
              onClick={() => open(offset + sharePageSize)}
              disabled={pending}
            >
              Earlier entries
            </Button>
          )}
        </nav>
      )}
    </section>
  );
}
