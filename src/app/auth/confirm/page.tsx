import { ConfirmForm } from "@/components/auth/forms";
import { AuthLink, AuthPanel } from "@/components/auth/panel";

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string | string[];
    token_hash?: string | string[];
  }>;
}) {
  const { type, token_hash: token } = await searchParams;
  if (
    (type !== "email" && type !== "recovery") ||
    typeof token !== "string" ||
    !token
  ) {
    return (
      <AuthPanel title="Invalid email link">
        <AuthLink href="/login">Back to sign in</AuthLink>
      </AuthPanel>
    );
  }
  return (
    <AuthPanel
      title={type === "email" ? "Confirm your email" : "Confirm password reset"}
    >
      <ConfirmForm type={type} token={token} />
    </AuthPanel>
  );
}
