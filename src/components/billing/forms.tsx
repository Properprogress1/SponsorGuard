"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  openBillingPortal,
  saveHealthChecklist,
  startCheckout,
} from "@/lib/billing/actions";
import { healthChecklist } from "@/lib/billing/model";

export function CheckoutForm({
  organisation,
  plan,
}: {
  organisation: string;
  plan: "core" | "pro";
}) {
  const [state, action, pending] = useActionState(
    startCheckout.bind(null, organisation),
    {},
  );
  const label = plan === "core" ? "Core" : "Pro";
  return (
    <form action={action} className="grid gap-3">
      <label className="grid gap-1 text-sm font-medium">
        {label} billing frequency
        <select
          name="offer"
          className="min-h-10 rounded-md border border-slate-500 bg-white px-3"
        >
          <option value={`${plan}_month`}>Monthly</option>
          <option value={`${plan}_year`}>Annual</option>
        </select>
      </label>
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Opening…" : `Choose ${label}`}
      </Button>
      {state.error && (
        <p role="alert" className="text-sm text-red-900">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function PortalForm({ organisation }: { organisation: string }) {
  const [state, action, pending] = useActionState(
    openBillingPortal.bind(null, organisation),
    {},
  );
  return (
    <form action={action} className="grid gap-2">
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        className="justify-self-start"
      >
        {pending ? "Opening…" : "Open Stripe customer portal"}
      </Button>
      {state.error && (
        <p role="alert" className="text-sm text-red-900">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function HealthChecklistForm({
  organisation,
  checked,
  editor,
}: {
  organisation: string;
  checked: string[];
  editor: boolean;
}) {
  const [state, action, pending] = useActionState(
    saveHealthChecklist.bind(null, organisation),
    {},
  );
  return (
    <form
      action={action}
      className="grid max-w-2xl gap-4 rounded-md border bg-white p-4"
    >
      <fieldset className="grid gap-3">
        <legend className="mb-2 text-lg font-semibold">
          Health-check checklist
        </legend>
        <p className="text-sm text-slate-700">
          Mark each item as you review it. The checklist records what you’ve
          reviewed.
        </p>
        {Object.entries(healthChecklist).map(([key, label]) => (
          <label key={key} className="flex items-start gap-2 text-sm">
            <input
              name={key}
              type="checkbox"
              defaultChecked={checked.includes(key)}
              disabled={!editor || pending}
              className="mt-1"
            />
            {label}
          </label>
        ))}
      </fieldset>
      {editor && (
        <Button type="submit" disabled={pending} className="justify-self-start">
          {pending ? "Saving…" : "Save checklist"}
        </Button>
      )}
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
