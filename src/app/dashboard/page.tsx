import { redirect } from "next/navigation";
import { workspaceMemberships } from "@/lib/auth/access";

export default async function DashboardEntry() {
  const [membership] = await workspaceMemberships();
  redirect(
    membership
      ? `/workspace/${membership.organisation_id}/dashboard`
      : "/onboarding",
  );
}
