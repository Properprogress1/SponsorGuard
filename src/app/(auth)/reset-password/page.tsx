import { redirect } from "next/navigation";
import { CredentialsForm } from "@/components/auth/forms";
import { AuthLink, AuthPanel } from "@/components/auth/panel";
import { isRecoverySession, verifiedSession } from "@/lib/auth/access";

export default async function ResetPasswordPage() {
  const session = await verifiedSession();
  if (!session || !(await isRecoverySession(session.claims.session_id)))
    redirect("/forgot-password");
  const { data, error } = await session.client.auth.mfa.listFactors();
  if (data?.totp.length && session.claims.aal !== "aal2") redirect("/mfa");
  return (
    <AuthPanel title="Set a new password">
      {error ? (
        <p role="alert">
          Could not check your security settings. Reload to try again.
        </p>
      ) : (
        <CredentialsForm mode="reset" />
      )}
      <p className="text-sm">
        <AuthLink href="/forgot-password">Request a new reset link</AuthLink>
      </p>
    </AuthPanel>
  );
}
