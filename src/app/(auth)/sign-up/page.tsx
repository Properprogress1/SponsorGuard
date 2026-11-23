import { CredentialsForm } from "@/components/auth/forms";
import { AuthLink, AuthPanel } from "@/components/auth/panel";

export default function SignUpPage() {
  return (
    <AuthPanel title="Create an account">
      <CredentialsForm mode="sign-up" />
      <p className="text-sm">
        <AuthLink href="/login">Already have an account? Sign in</AuthLink>
      </p>
    </AuthPanel>
  );
}
