import { CredentialsForm } from "@/components/auth/forms";
import { AuthLink, AuthPanel } from "@/components/auth/panel";

export default function LoginPage() {
  return (
    <AuthPanel title="Sign in">
      <CredentialsForm mode="sign-in" />
      <div className="grid gap-3 text-sm">
        <AuthLink href="/forgot-password">Forgot your password?</AuthLink>
        <AuthLink href="/sign-up">Create an account</AuthLink>
      </div>
    </AuthPanel>
  );
}
