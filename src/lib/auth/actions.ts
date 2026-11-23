"use server";

import { cookies } from "next/headers";
import { redirect, RedirectType } from "next/navigation";
import { allowSecurityRequest } from "@/lib/security/rate-limit";
import { authClient } from "./server";
import { authConfig, cookieOptions } from "./config";
import {
  isRecoverySession,
  recoveryCookie,
  requireWorkspaceSession,
} from "./access";

type FormState = { error?: string; message?: string };
type EnrolmentState = FormState & {
  factorId?: string;
  secret?: string;
  qrCode?: string;
};

function field(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

const unavailable = { error: "Sign-in is temporarily unavailable." };
const throttled = {
  error: "Too many attempts or the service is unavailable. Try again shortly.",
};
const resetMessage = {
  message:
    "If an account exists for that email address, we’ll send a reset link.",
};

function emailSubject(form: FormData) {
  const email = field(form, "email").trim().toLowerCase();
  return email.length <= 254 ? email : "";
}

const passwordError = {
  error:
    "Enter a password with at least 12 characters and no more than 72 bytes.",
};

function validPassword(password: string) {
  return (
    password.length >= 12 && new TextEncoder().encode(password).length <= 72
  );
}

export async function signUp(_: FormState, form: FormData): Promise<FormState> {
  if (!authConfig()) return unavailable;
  const email = emailSubject(form);
  if (!(await allowSecurityRequest("auth_sign_up", email))) return throttled;
  if (!email) return unavailable;
  const password = field(form, "password");
  if (!validPassword(password)) return passwordError;
  const client = await authClient(true);
  const { data, error } = await client.auth.signUp({
    email,
    password,
  });
  if (error)
    return {
      error:
        "We could not create your account. Check your details or try again shortly.",
    };
  if (data.session) redirect("/dashboard");
  return { message: "Check your email for a confirmation link." };
}

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  if (!authConfig()) return unavailable;
  const email = emailSubject(form);
  if (!(await allowSecurityRequest("auth_sign_in", email))) return throttled;
  if (!email) return unavailable;
  const client = await authClient(true);
  const { error } = await client.auth.signInWithPassword({
    email,
    password: field(form, "password"),
  });
  if (error)
    return {
      error:
        "Sign-in failed. Check your email, password and email confirmation.",
    };
  (await cookies()).delete(recoveryCookie);
  redirect("/dashboard");
}

export async function signOut() {
  const client = await authClient(true);
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error) throw new Error("Could not sign out. Try again.");
  (await cookies()).delete(recoveryCookie);
  redirect("/login");
}

export async function requestReset(
  _: FormState,
  form: FormData,
): Promise<FormState> {
  if (!authConfig()) return unavailable;
  const email = emailSubject(form);
  if ((await allowSecurityRequest("auth_reset_request", email)) && email) {
    const client = await authClient();
    await client.auth.resetPasswordForEmail(email);
  }
  return resetMessage;
}

export async function confirmEmail(
  _: FormState,
  form: FormData,
): Promise<FormState> {
  if (!authConfig()) return unavailable;
  const type = field(form, "type");
  const token_hash = field(form, "token");
  if (
    !token_hash ||
    token_hash.length > 512 ||
    (type !== "email" && type !== "recovery")
  ) {
    return {
      error: "This link is invalid. Request a new email and try again.",
    };
  }
  if (!(await allowSecurityRequest("auth_confirm", token_hash)))
    return throttled;
  const client = await authClient(true);
  const { error } = await client.auth.verifyOtp({ type, token_hash });
  if (error)
    return {
      error:
        "This link is invalid or has expired. Request a new email and try again.",
    };

  const store = await cookies();
  if (type === "recovery") {
    const { data } = await client.auth.getClaims();
    const sessionId = data?.claims.session_id;
    if (typeof sessionId !== "string")
      return {
        error: "Could not start password recovery. Request a new link.",
      };
    store.set(recoveryCookie, sessionId, { ...cookieOptions, maxAge: 900 });
    redirect("/reset-password", RedirectType.replace);
  }
  store.delete(recoveryCookie);
  redirect("/dashboard", RedirectType.replace);
}

export async function updatePassword(
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const client = await authClient(true);
  const { data: verified } = await client.auth.getClaims();
  if (!(await isRecoverySession(verified?.claims.session_id)))
    redirect("/forgot-password");
  if (
    !verified?.claims.sub ||
    !(await allowSecurityRequest("auth_password_update", verified.claims.sub))
  )
    return throttled;
  const { data, error: factorError } = await client.auth.mfa.listFactors();
  if (factorError)
    return { error: "Could not check your security settings. Try again." };
  if (data.totp.length && verified?.claims.aal !== "aal2") redirect("/mfa");

  const password = field(form, "password");
  if (!validPassword(password)) return passwordError;
  if (password !== field(form, "confirmPassword"))
    return { error: "The passwords do not match." };
  const { error } = await client.auth.updateUser({ password });
  if (error)
    return {
      error:
        "Could not reset your password. Use a new password or request another link.",
    };
  (await cookies()).delete(recoveryCookie);
  redirect("/dashboard");
}

export async function startTotp(): Promise<EnrolmentState> {
  const client = await authClient(true);
  const { data: verified } = await client.auth.getClaims();
  if (!verified?.claims.sub) redirect("/login");
  if (verified.claims.aal === "aal2") redirect("/dashboard");
  if (await isRecoverySession(verified.claims.session_id))
    redirect("/reset-password");

  if (!(await allowSecurityRequest("auth_mfa_enrol", verified.claims.sub)))
    return throttled;
  const { data, error } = await client.auth.mfa.listFactors();
  if (error)
    return { error: "Could not check your authenticator settings. Try again." };
  if (data.totp.length)
    return {
      error: "An authenticator is already set up. Reload to enter a code.",
    };
  for (const factor of data.all) {
    if (factor.factor_type === "totp" && factor.status === "unverified") {
      const { error: removalError } = await client.auth.mfa.unenroll({
        factorId: factor.id,
      });
      if (removalError)
        return { error: "Could not restart authenticator setup. Try again." };
    }
  }
  const result = await client.auth.mfa.enroll({
    factorType: "totp",
    issuer: "SponsorGuard",
  });
  if (result.error)
    return { error: "Could not start authenticator setup. Try again." };
  const svgPrefix = "data:image/svg+xml;utf-8,";
  const svg = result.data.totp.qr_code;
  return {
    factorId: result.data.id,
    secret: result.data.totp.secret,
    qrCode: svg.startsWith(svgPrefix)
      ? `data:image/svg+xml;base64,${Buffer.from(svg.slice(svgPrefix.length)).toString("base64")}`
      : undefined,
  };
}

export async function verifyTotp(
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const client = await authClient(true);
  const { data } = await client.auth.getClaims();
  if (!data?.claims.sub) redirect("/login");
  if (!(await allowSecurityRequest("auth_mfa_verify", data.claims.sub)))
    return throttled;
  const code = field(form, "code").trim();
  if (!/^\d{6}$/.test(code))
    return { error: "Enter the six-digit code from your authenticator." };
  const { error } = await client.auth.mfa.challengeAndVerify({
    factorId: field(form, "factorId"),
    code,
  });
  if (error)
    return {
      error:
        "That code could not be verified. Enter the latest code and try again.",
    };
  redirect(
    (await isRecoverySession(data.claims.session_id))
      ? "/reset-password"
      : "/dashboard",
  );
}

export async function createOrganisation(
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const { client } = await requireWorkspaceSession();
  const organisationName = field(form, "organisationName").trim();
  const displayName = field(form, "displayName").trim();
  if (
    !organisationName ||
    !displayName ||
    organisationName.length > 120 ||
    displayName.length > 120
  ) {
    return { error: "Enter both names using 1 to 120 characters." };
  }
  const { data, error } = await client.rpc("onboard_organisation", {
    organisation_name: organisationName,
    owner_display_name: displayName,
  });
  if (error || typeof data !== "string")
    return { error: "Could not create your organisation. Try again." };
  redirect(`/workspace/${data}/dashboard`);
}
