import { redirect } from "next/navigation";
import { TotpForm } from "@/components/auth/forms";
import { AuthPanel } from "@/components/auth/panel";
import { Button } from "@/components/ui/button";
import { isRecoverySession, verifiedSession } from "@/lib/auth/access";
import { signOut } from "@/lib/auth/actions";

export default async function MfaPage() {
  const session = await verifiedSession();
  if (!session) redirect("/login");
  const recovery = await isRecoverySession(session.claims.session_id);
  if (session.claims.aal === "aal2")
    redirect(recovery ? "/reset-password" : "/dashboard");
  const { data, error } = await session.client.auth.mfa.listFactors();
  const factors =
    data?.totp.map((factor, index) => ({
      id: factor.id,
      name: factor.friendly_name || `Authenticator ${index + 1}`,
    })) ?? [];
  if (recovery && !error && factors.length === 0) redirect("/reset-password");

  return (
    <AuthPanel
      title={
        factors.length
          ? "Verify your authenticator"
          : "Set up multi-factor authentication"
      }
    >
      {error ? (
        <p role="alert">
          Could not load your authenticators. Reload to try again.
        </p>
      ) : (
        <TotpForm factors={factors} />
      )}
      <form action={signOut}>
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </AuthPanel>
  );
}
