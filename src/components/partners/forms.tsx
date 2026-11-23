"use client";

import { useActionState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  cancelPartnerInvite,
  changePartnerAccess,
  invitePartnerClient,
  savePartnerBrand,
} from "@/lib/partners/actions";
import {
  partnerRoles,
  type Connection,
  type PartnerBrand,
} from "@/lib/partners/model";

const field = "min-h-10 rounded-md border border-slate-500 bg-white px-3";
const subscribe = () => () => {};
const origin = () => window.location.origin;
const serverOrigin = () => "";

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

export function PartnerBrandForm({
  organisation,
  brand,
}: {
  organisation: string;
  brand: Pick<PartnerBrand, "primary_colour" | "accent_colour" | "logo_data">;
}) {
  const [state, action, pending] = useActionState(
    savePartnerBrand.bind(null, organisation),
    {},
  );
  return (
    <form action={action} className="grid max-w-xl gap-3">
      <label className="grid gap-1 text-sm font-medium">
        Primary colour
        <input
          name="primary"
          className={field}
          defaultValue={brand.primary_colour}
          pattern="#[0-9A-Fa-f]{6}"
          required
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Accent colour
        <input
          name="accent"
          className={field}
          defaultValue={brand.accent_colour}
          pattern="#[0-9A-Fa-f]{6}"
          required
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Logo (PNG or JPEG, up to 128 KiB)
        <input name="logo" type="file" accept="image/png,image/jpeg" />
      </label>
      {brand.logo_data && (
        <label className="flex gap-2 text-sm">
          <input name="clear_logo" type="checkbox" /> Remove logo
        </label>
      )}
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Saving…" : "Save partner branding"}
      </Button>
      <Feedback state={state} />
    </form>
  );
}

export function PartnerInviteForm({ organisation }: { organisation: string }) {
  const [state, action, pending] = useActionState(
    invitePartnerClient.bind(null, organisation),
    {},
  );
  const base = useSyncExternalStore(subscribe, origin, serverOrigin);
  return (
    <form action={action} className="grid max-w-xl gap-3">
      <label className="grid gap-1 text-sm font-medium">
        Client owner’s email address
        <input
          type="email"
          name="email"
          className={field}
          maxLength={254}
          required
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Offered access role
        <select name="role" defaultValue="viewer" className={field}>
          {Object.entries(partnerRoles).map(([role, label]) => (
            <option key={role} value={role}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Creating…" : "Create invitation"}
      </Button>
      <Feedback state={state} />
      {base && state.token && (
        <label className="grid gap-1 text-sm font-medium">
          Invitation link
          <input
            readOnly
            value={`${base}/partner-invitation#${state.token}`}
            className={field}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
    </form>
  );
}

export function InviteCancelForm({
  organisation,
  invitation,
}: {
  organisation: string;
  invitation: string;
}) {
  const [state, action, pending] = useActionState(
    cancelPartnerInvite.bind(null, organisation, invitation),
    {},
  );
  return (
    <form action={action} className="grid gap-1">
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        Cancel invitation
      </Button>
      <Feedback state={state} />
    </form>
  );
}

export function PartnerAccessForm({
  organisation,
  connection,
  editable,
}: {
  organisation: string;
  connection: Connection;
  editable: boolean;
}) {
  const [state, action, pending] = useActionState(
    changePartnerAccess.bind(null, organisation, connection.id),
    {},
  );
  return (
    <form action={action} className="grid gap-3">
      {editable && (
        <label className="grid gap-1 text-sm font-medium">
          Access role for {connection.organisation_name}
          <select name="role" defaultValue={connection.role} className={field}>
            {Object.entries(partnerRoles).map(([role, label]) => (
              <option key={role} value={role}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {editable && (
          <Button
            type="submit"
            variant="outline"
            name="action"
            value="save"
            size="sm"
            disabled={pending}
          >
            Save role
          </Button>
        )}
        <Button
          type="submit"
          variant="outline"
          name="action"
          value="revoke"
          size="sm"
          disabled={pending}
        >
          Revoke access
        </Button>
      </div>
      <Feedback state={state} />
    </form>
  );
}
