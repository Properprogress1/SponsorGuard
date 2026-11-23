import Link from "next/link";
import type { Metadata } from "next";
import { PartnerInvitationConsent } from "@/components/partners/consent";
import {
  isRecoverySession,
  verifiedSession,
  workspaceMemberships,
} from "@/lib/auth/access";

export const metadata: Metadata = {
  title: "Partner invitation | SponsorGuard UK",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function PartnerInvitationPage() {
  const session = await verifiedSession();
  const ready =
    session?.claims.aal === "aal2" &&
    !(await isRecoverySession(session.claims.session_id));
  const clients = ready
    ? (await workspaceMemberships())
        .filter(
          (membership) =>
            membership.role === "owner" && !membership.via_partner,
        )
        .map((membership) => ({
          id: membership.organisation_id,
          name: membership.organisations.name,
        }))
    : [];

  return (
    <main className="mx-auto grid min-h-screen max-w-3xl content-start gap-5 px-5 py-12">
      <h1 className="text-3xl font-semibold">Partner invitation</h1>
      {ready ? (
        <PartnerInvitationConsent clients={clients} />
      ) : (
        <div className="grid gap-3">
          <p>
            Sign in with the invited email address and complete MFA. Then reopen
            the invitation link.
          </p>
          <Link href="/dashboard" className="w-fit underline">
            Open SponsorGuard
          </Link>
        </div>
      )}
    </main>
  );
}
