import { CredentialsForm } from "@/components/auth/forms";
import { AuthLink, AuthPanel } from "@/components/auth/panel";

export default function ForgotPasswordPage() {
  return (
    <AuthPanel title="Reset your password">
      <CredentialsForm mode="request-reset" />
      <p className="text-sm">
        <AuthLink href="/login">Back to sign in</AuthLink>
      </p>
    </AuthPanel>
  );
}
