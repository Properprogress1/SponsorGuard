import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  canEditRecords,
  requireWorkspaceSession,
  type Role,
} from "@/lib/auth/access";
import { planNames, type BillingSummary } from "@/lib/billing/model";
import { CheckoutForm, HealthChecklistForm, PortalForm } from "./forms";

export function UpgradePrompt({
  organisation,
  plan,
}: {
  organisation: string;
  plan: "core" | "pro";
}) {
  return (
    <section className="mt-5 grid max-w-xl gap-3 rounded-md border bg-white p-4">
      <h2 className="text-lg font-semibold">
        Available on {planNames[plan]}
        {plan === "core" ? " and Pro" : ""}
      </h2>
      <p className="text-sm text-slate-700">
        Your organisation’s owner can change the plan in Billing.
      </p>
      <Button asChild className="justify-self-start">
        <Link href={`/workspace/${organisation}/billing`}>View plans</Link>
      </Button>
    </section>
  );
}

export function BillingWorkspace({
  organisation,
  summary,
  owner,
  returned,
}: {
  organisation: string;
  summary: BillingSummary;
  owner: boolean;
  returned: boolean;
}) {
  return (
    <section className="mt-5 grid gap-5">
      <p>
        Current plan <strong>{planNames[summary.plan]}</strong>
      </p>
      {summary.plan !== "free" && (
        <p>
          {summary.worker_count} of {summary.worker_limit} sponsored worker
          slots used
        </p>
      )}
      {returned && (
        <p role="status" className="text-sm">
          Stripe is confirming your subscription. Refresh this page for the
          latest status.
        </p>
      )}
      {owner && summary.has_customer && (
        <PortalForm organisation={organisation} />
      )}
      <p className="text-sm">
        Annual plans include 12 months for the price of 10. The organisation
        owner manages billing.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <section
          aria-label="Core plan"
          className="grid gap-3 rounded-md border bg-white p-4"
        >
          <h2 className="text-lg font-semibold">Core</h2>
          <p>
            <strong>£99/month</strong> or £990/year
          </p>
          <p className="text-sm">
            20 sponsored workers, reporting, document vault, Passport
            verification and audit packs.
          </p>
          {owner && summary.plan === "free" && (
            <CheckoutForm organisation={organisation} plan="core" />
          )}
        </section>
        <section
          aria-label="Pro plan"
          className="grid gap-3 rounded-md border bg-white p-4"
        >
          <h2 className="text-lg font-semibold">Pro</h2>
          <p>
            <strong>£199/month</strong> or £1,990/year
          </p>
          <p className="text-sm">
            60 sponsored workers, Passport sharing, Continuity Guard and the
            extended workforce map.
          </p>
          {owner && summary.plan === "free" && (
            <CheckoutForm organisation={organisation} plan="pro" />
          )}
        </section>
      </div>
    </section>
  );
}

export async function HealthChecklistWorkspace({
  organisation,
  role,
}: {
  organisation: string;
  role: Role;
}) {
  const { client } = await requireWorkspaceSession();
  const { data, error } = await client
    .from("health_checklists")
    .select("checked")
    .eq("organisation_id", organisation)
    .maybeSingle<{ checked: string[] }>();
  if (error)
    return (
      <p role="alert" className="mt-5">
        Could not load the health-check checklist.
      </p>
    );
  return (
    <section className="mt-5 grid gap-4">
      <HealthChecklistForm
        organisation={organisation}
        checked={data?.checked ?? []}
        editor={canEditRecords(role)}
      />
      <UpgradePrompt organisation={organisation} plan="core" />
    </section>
  );
}
