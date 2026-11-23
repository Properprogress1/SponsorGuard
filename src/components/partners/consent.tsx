"use client";

import Link from "next/link";
import {
  useActionState,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { Button } from "@/components/ui/button";
import { consentToPartner, inspectPartnerInvite } from "@/lib/partners/actions";
import { partnerRoles } from "@/lib/partners/model";
import { londonTime } from "@/lib/passport/model";

type Client = { id: string; name: string };
type Preview = Awaited<ReturnType<typeof inspectPartnerInvite>>;

function subscribe(notify: () => void) {
  window.addEventListener("hashchange", notify);
  return () => window.removeEventListener("hashchange", notify);
}

export function PartnerInvitationConsent({ clients }: { clients: Client[] }) {
  const token = useSyncExternalStore(
    subscribe,
    () => window.location.hash.slice(1),
    () => null,
  );
  if (token === null) return <p role="status">Opening invitation…</p>;
  return <ConsentForm key={token} token={token} clients={clients} />;
}

function ConsentForm({ token, clients }: { token: string; clients: Client[] }) {
  const [preview, setPreview] = useState<Preview | undefined>(undefined);
  const [state, submit, pending] = useActionState(consentToPartner, {});
  useEffect(() => {
    let active = true;
    void inspectPartnerInvite(token).then(
      (result) => {
        if (active) setPreview(result);
      },
      () => {
        if (active) setPreview(null);
      },
    );
    return () => {
      active = false;
    };
  }, [token]);

  if (state.message)
    return (
      <div className="grid gap-3">
        <p role="status">{state.message}</p>
        <Link href="/dashboard" className="w-fit underline">
          Go to your workspace
        </Link>
      </div>
    );
  if (preview === undefined) return <p role="status">Opening invitation…</p>;
  if (preview === null)
    return (
      <p role="alert">
        This invitation is unavailable. Check that you signed in using the
        invited email address.
      </p>
    );
  return (
    <form
      action={submit}
      className="grid max-w-lg gap-4 rounded-md border bg-white p-5"
    >
      <p>
        <strong>{preview.partner_name}</strong> requests{" "}
        <strong>{partnerRoles[preview.role]}</strong> access to one of your
        organisations.
      </p>
      <p className="text-sm">
        Expires {londonTime(preview.expires_at)}. You can change the role or
        revoke access in Partners.
      </p>
      {clients.length ? (
        <>
          <input type="hidden" name="token" value={token} />
          <label className="grid gap-1 text-sm font-medium">
            Client organisation
            <select
              name="tenant"
              required
              defaultValue=""
              className="min-h-10 rounded-md border border-slate-500 bg-white px-3"
            >
              <option value="" disabled>
                Choose an organisation
              </option>
              {clients.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="submit"
            disabled={pending}
            className="justify-self-start"
          >
            {pending ? "Granting…" : "Grant partner access"}
          </Button>
          {state.error && (
            <p role="alert" className="text-sm text-red-900">
              {state.error}
            </p>
          )}
        </>
      ) : (
        <p>
          Only an organisation owner can approve an invitation.{" "}
          <Link href="/dashboard" className="underline">
            Open SponsorGuard
          </Link>{" "}
          to set up your workspace, then reopen this link.
        </p>
      )}
    </form>
  );
}
