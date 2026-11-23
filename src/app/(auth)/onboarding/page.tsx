import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/auth/forms";
import { AuthPanel } from "@/components/auth/panel";
import { Button } from "@/components/ui/button";
import { workspaceMemberships } from "@/lib/auth/access";
import { signOut } from "@/lib/auth/actions";

export default async function OnboardingPage() {
  const [membership] = await workspaceMemberships();
  if (membership)
    redirect(`/workspace/${membership.organisation_id}/dashboard`);
  return (
    <AuthPanel title="Create your organisation">
      <OnboardingForm />
      <form action={signOut}>
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </AuthPanel>
  );
}
