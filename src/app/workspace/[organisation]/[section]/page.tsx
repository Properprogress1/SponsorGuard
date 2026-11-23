import { PrivacyWorkspace } from "@/components/privacy/workspace";
import Image from "next/image";
import type { CSSProperties } from "react";
import { PartnersWorkspace } from "@/components/partners/workspace";
import {
  brandInk,
  defaultBrand,
  type PartnerBrand,
} from "@/lib/partners/model";
import {
  BillingWorkspace,
  HealthChecklistWorkspace,
  UpgradePrompt,
} from "@/components/billing/workspace";
import { getWorkspaceBilling } from "@/lib/billing/data";
import { AuditPackWorkspace } from "@/components/audit-pack/workspace";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  HandoverTasks,
  PersonnelWorkspace,
} from "@/components/key-personnel/workspace";
import { NotificationsWorkspace } from "@/components/notifications/workspace";
import { DocumentsWorkspace } from "@/components/documents/workspace";
import { PassportShares } from "@/components/passport/shares";
import { PassportIntegrity } from "@/components/passport-integrity";
import { PeopleWorkspace } from "@/components/people/workspace";
import { ReportingWorkspace } from "@/components/reporting/workspace";
import { WorkforceWorkspace } from "@/components/workforce/workspace";
import { Button } from "@/components/ui/button";
import {
  isManager,
  requireWorkspaceSession,
  workspaceMemberships,
} from "@/lib/auth/access";
import { signOut } from "@/lib/auth/actions";

const sections = [
  { route: "dashboard", title: "Dashboard" },
  { route: "people", title: "People" },
  { route: "workforce", title: "Workforce" },
  { route: "reporting", title: "Reporting" },
  { route: "tasks", title: "Tasks" },
  { route: "documents", title: "Documents" },
  { route: "passport", title: "Passport" },
  { route: "audit-pack", title: "Audit pack", adminOnly: true },
  { route: "key-personnel", title: "Key Personnel", adminOnly: true },
  { route: "notifications", title: "Notifications" },
  { route: "billing", title: "Billing" },
  { route: "privacy", title: "Privacy", adminOnly: true },
  { route: "partners", title: "Partners" },
  { route: "settings", title: "Settings", adminOnly: true },
] as const;

const roleLabels = {
  owner: "Owner",
  admin: "Admin",
  hr_user: "HR user",
  viewer: "Viewer",
};

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  params: Promise<{ organisation: string; section: string }>;
}) {
  const { organisation, section } = await params;
  const active = sections.find((item) => item.route === section);
  if (!active) notFound();
  const memberships = await workspaceMemberships();
  if (!memberships.length) redirect("/onboarding");
  const membership = memberships.find(
    (item) => item.organisation_id === organisation,
  );
  if (!membership) notFound();
  const manager = isManager(membership.role);
  const delegated = Boolean(membership.via_partner);
  if (
    delegated &&
    (section === "partners" || section === "settings" || section === "privacy")
  )
    redirect(`/workspace/${organisation}/dashboard`);
  if ("adminOnly" in active && !manager)
    redirect(`/workspace/${organisation}/dashboard`);

  const { client } = await requireWorkspaceSession();
  const [billing, branding] = await Promise.all([
    getWorkspaceBilling(organisation),
    client
      .rpc("workspace_partner_brand", { tenant: organisation })
      .maybeSingle<PartnerBrand>(),
  ]);
  if (branding.error) throw new Error("Could not load the workspace brand.");
  const brand = branding.data;
  const palette = brand ?? defaultBrand;
  const colours = {
    "--workspace-primary": palette.primary_colour,
    "--workspace-ink": brandInk(palette.primary_colour),
    "--workspace-accent": palette.accent_colour,
    "--workspace-accent-ink": brandInk(palette.accent_colour),
  } as CSSProperties;
  const delegatedClients = memberships.filter((item) => item.via_partner);
  const directOthers = memberships.filter(
    (item) => !item.via_partner && item.organisation_id !== organisation,
  );
  if (!billing) notFound();
  const pro = billing.plan === "pro";
  const free = billing.plan === "free";
  const billingOpen = section === "billing";
  const partnersOpen = section === "partners";
  const privacyOpen = section === "privacy";
  const dashboard = section === "dashboard";
  const requiredPlan =
    free && !dashboard && !billingOpen && !partnersOpen && !privacyOpen
      ? "core"
      : !pro && (section === "workforce" || section === "key-personnel")
        ? "pro"
        : null;
  const workspaceAllowed = !requiredPlan;

  return (
    <div className="min-h-screen bg-slate-50 md:grid md:grid-cols-[16rem_minmax(0,1fr)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-10 focus:rounded-md focus:bg-white focus:p-3"
      >
        Skip to main content
      </a>
      <aside
        style={colours}
        className="flex flex-col gap-6 bg-[var(--workspace-primary)] p-5 text-[var(--workspace-ink)]"
      >
        <Link href="/dashboard" className="text-lg font-semibold">
          {brand?.logo_data && (
            <Image
              src={brand.logo_data}
              alt=""
              width={120}
              height={44}
              unoptimized
              className="mb-2 h-11 w-auto max-w-full object-contain object-left"
            />
          )}
          {brand?.partner_name ?? "SponsorGuard UK"}
        </Link>
        <div className="min-w-0 break-words">
          <p className="font-medium">{membership.organisations.name}</p>
          <p className="text-sm">
            {roleLabels[membership.role]}
            {delegated ? " · Partner access" : ""}
          </p>
        </div>
        <nav aria-label="Workspace">
          <ul className="grid gap-1">
            {sections
              .filter((item) => !("adminOnly" in item) || manager)
              .filter(
                (item) =>
                  !free ||
                  ["dashboard", "billing", "partners", "privacy"].includes(
                    item.route,
                  ),
              )
              .filter(
                (item) =>
                  !delegated ||
                  !["partners", "settings", "privacy"].includes(item.route),
              )
              .map((item) => (
                <li key={item.route}>
                  <Link
                    href={`/workspace/${organisation}/${item.route}`}
                    aria-current={item.route === section ? "page" : undefined}
                    className="block rounded-md px-3 py-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current aria-[current=page]:bg-[var(--workspace-accent)] aria-[current=page]:text-[var(--workspace-accent-ink)]"
                  >
                    {item.title}
                  </Link>
                </li>
              ))}
          </ul>
        </nav>
        {delegatedClients.length > 0 && (
          <nav aria-label="Client switcher" className="grid gap-2">
            <h2 className="text-sm font-semibold">Client switcher</h2>
            <ul className="grid max-h-56 gap-2 overflow-auto">
              {delegatedClients.map((item) => (
                <li key={item.organisation_id}>
                  <Link
                    className="block break-words underline"
                    href={`/workspace/${item.organisation_id}/dashboard`}
                    aria-current={
                      item.organisation_id === organisation ? "page" : undefined
                    }
                  >
                    {item.organisations.name}
                  </Link>
                  <p className="text-sm">{item.partner_name}</p>
                </li>
              ))}
            </ul>
          </nav>
        )}
        {directOthers.length > 0 && (
          <nav aria-label="Other organisations">
            <ul className="grid gap-2">
              {directOthers.map((item) => (
                <li key={item.organisation_id}>
                  <Link
                    className="break-words underline"
                    href={`/workspace/${item.organisation_id}/dashboard`}
                  >
                    {item.organisations.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <form action={signOut}>
          <Button type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
      </aside>
      <main id="main-content" tabIndex={-1} className="min-w-0 p-6 sm:p-10">
        <h1 className="text-3xl font-semibold tracking-tight">
          {active.title}
        </h1>
        {requiredPlan && (
          <UpgradePrompt organisation={organisation} plan={requiredPlan} />
        )}
        {dashboard && free && (
          <HealthChecklistWorkspace
            organisation={organisation}
            role={membership.role}
          />
        )}
        {privacyOpen && (
          <PrivacyWorkspace
            organisation={organisation}
            owner={membership.role === "owner"}
            params={await searchParams}
          />
        )}
        {partnersOpen && (
          <PartnersWorkspace
            organisation={organisation}
            role={membership.role}
            brand={brand}
          />
        )}
        {billingOpen && (
          <BillingWorkspace
            organisation={organisation}
            summary={billing}
            owner={membership.role === "owner"}
            returned={(await searchParams).checkout === "returned"}
          />
        )}
        {workspaceAllowed && section === "people" && (
          <PeopleWorkspace
            billing={billing}
            organisation={organisation}
            role={membership.role}
            params={await searchParams}
          />
        )}
        {workspaceAllowed && section === "workforce" && (
          <WorkforceWorkspace
            organisation={organisation}
            role={membership.role}
            params={await searchParams}
          />
        )}
        {workspaceAllowed && section === "documents" && (
          <DocumentsWorkspace
            organisation={organisation}
            role={membership.role}
            params={await searchParams}
          />
        )}
        {workspaceAllowed &&
          (section === "reporting" || section === "tasks") && (
            <ReportingWorkspace
              organisation={organisation}
              role={membership.role}
              section={section}
              params={await searchParams}
            />
          )}
        {workspaceAllowed && section === "key-personnel" && (
          <PersonnelWorkspace organisation={organisation} />
        )}
        {workspaceAllowed && section === "tasks" && manager && pro && (
          <HandoverTasks organisation={organisation} />
        )}
        {workspaceAllowed && section === "notifications" && (
          <NotificationsWorkspace organisation={organisation} />
        )}
        {workspaceAllowed && section === "audit-pack" && (
          <AuditPackWorkspace organisation={organisation} />
        )}
        {workspaceAllowed && section === "passport" && (
          <>
            <PassportIntegrity organisation={organisation} />
            {manager && !pro && (
              <UpgradePrompt organisation={organisation} plan="pro" />
            )}
            {manager && pro && !delegated && (
              <PassportShares
                organisation={organisation}
                page={(await searchParams).shares}
              />
            )}
          </>
        )}
        {[
          "dashboard",
          "people",
          "workforce",
          "reporting",
          "tasks",
          "documents",
          "passport",
          "audit-pack",
          "key-personnel",
        ].includes(section) && (
          <p className="mt-4 text-sm text-slate-700">
            SponsorGuard tracks your records. It does not provide immigration
            advice or guarantee compliance.
          </p>
        )}
      </main>
    </div>
  );
}
