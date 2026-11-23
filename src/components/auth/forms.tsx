"use client";

import Image from "next/image";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { Button } from "@/components/ui/button";
import {
  confirmEmail,
  createOrganisation,
  requestReset,
  signIn,
  signUp,
  startTotp,
  updatePassword,
  verifyTotp,
} from "@/lib/auth/actions";

type FieldProps = Omit<ComponentProps<"input">, "id"> & {
  name: string;
  label: string;
  hint?: string;
};

function Field({ name, label, hint, ...props }: FieldProps) {
  return (
    <div className="grid gap-2">
      <label className="text-sm font-semibold" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        aria-describedby={hint ? `${name}-hint` : undefined}
        required
        className="min-h-11 rounded-md border border-slate-500 bg-background px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-800"
        {...props}
      />
      {hint && (
        <p id={`${name}-hint`} className="text-sm text-slate-700">
          {hint}
        </p>
      )}
    </div>
  );
}

function Feedback({ error, message }: { error?: string; message?: string }) {
  return (
    <>
      {error && (
        <p role="alert" className="text-sm font-medium text-red-800">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm font-medium text-emerald-800">
          {message}
        </p>
      )}
    </>
  );
}

type CredentialsMode = "sign-in" | "sign-up" | "request-reset" | "reset";
const formConfig = {
  "sign-in": { action: signIn, button: "Sign in" },
  "sign-up": { action: signUp, button: "Create account" },
  "request-reset": { action: requestReset, button: "Send reset link" },
  reset: { action: updatePassword, button: "Set new password" },
};

export function CredentialsForm({ mode }: { mode: CredentialsMode }) {
  const config = formConfig[mode];
  const [state, action, pending] = useActionState(config.action, {});
  const newPassword = mode === "sign-up" || mode === "reset";
  return (
    <form action={action} className="grid gap-5">
      {mode !== "reset" && (
        <Field
          name="email"
          label="Email address"
          type="email"
          autoComplete="email"
          maxLength={254}
        />
      )}
      {mode !== "request-reset" && (
        <Field
          name="password"
          label={mode === "reset" ? "New password" : "Password"}
          type="password"
          autoComplete={newPassword ? "new-password" : "current-password"}
          minLength={newPassword ? 12 : undefined}
          hint={newPassword ? "Use at least 12 characters." : undefined}
        />
      )}
      {mode === "reset" && (
        <Field
          name="confirmPassword"
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
        />
      )}
      <Feedback {...state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Please wait…" : config.button}
      </Button>
    </form>
  );
}

export function ConfirmForm({
  type,
  token,
}: {
  type: "email" | "recovery";
  token: string;
}) {
  const [state, action, pending] = useActionState(confirmEmail, {});
  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="token" value={token} />
      <Feedback {...state} />
      <Button type="submit" disabled={pending}>
        {type === "email" ? "Confirm email" : "Continue to password reset"}
      </Button>
    </form>
  );
}

function CodeForm({ factorId }: { factorId: string }) {
  const [state, action, pending] = useActionState(verifyTotp, {});
  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="factorId" value={factorId} />
      <Field
        name="code"
        label="Authenticator code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        hint="Enter the current six-digit code."
      />
      <Feedback {...state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Verifying…" : "Verify code"}
      </Button>
    </form>
  );
}

export function TotpForm({
  factors,
}: {
  factors: { id: string; name: string }[];
}) {
  const [enrolment, enrol, pending] = useActionState(startTotp, {});
  const [selected, select] = useState(factors[0]?.id);
  const setupHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (enrolment.factorId) setupHeading.current?.focus();
  }, [enrolment.factorId]);
  if (selected) {
    return (
      <div className="grid gap-5">
        {factors.length > 1 && (
          <div className="grid gap-2">
            <label htmlFor="authenticator" className="text-sm font-semibold">
              Authenticator
            </label>
            <select
              id="authenticator"
              value={selected}
              onChange={(event) => select(event.target.value)}
              className="min-h-11 rounded-md border border-slate-500 px-3"
            >
              {factors.map((factor) => (
                <option key={factor.id} value={factor.id}>
                  {factor.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <CodeForm key={selected} factorId={selected} />
      </div>
    );
  }
  if (enrolment.factorId) {
    return (
      <div className="grid gap-5">
        <h2 tabIndex={-1} ref={setupHeading} className="font-semibold">
          Add SponsorGuard to your authenticator
        </h2>
        <p>
          Scan the QR code or enter the setup key in your authenticator app.
          Then verify the code it generates.
        </p>
        {enrolment.qrCode && (
          <Image
            src={enrolment.qrCode}
            width={180}
            height={180}
            unoptimized
            alt="Authenticator setup QR code. The manual setup key follows."
          />
        )}
        <code
          aria-label="Setup key"
          className="break-all rounded-md bg-slate-100 p-3 font-mono text-slate-950"
        >
          {enrolment.secret}
        </code>
        <CodeForm factorId={enrolment.factorId} />
      </div>
    );
  }
  return (
    <form action={enrol} className="grid gap-5">
      <p>Use a time-based authenticator app to protect your account.</p>
      <Feedback error={enrolment.error} />
      <Button type="submit" disabled={pending}>
        {pending ? "Preparing…" : "Set up authenticator"}
      </Button>
    </form>
  );
}

export function OnboardingForm() {
  const [state, submit, pending] = useActionState(createOrganisation, {});
  const [details, setDetails] = useState({
    organisationName: "",
    displayName: "",
  });
  const [review, setReview] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (review) heading.current?.focus();
  }, [review]);

  if (review) {
    return (
      <form action={submit} className="grid gap-5">
        <h2 tabIndex={-1} ref={heading} className="font-semibold">
          Step 2 of 2 · Review details
        </h2>
        <dl className="grid gap-3 break-words">
          <div>
            <dt className="font-semibold">Organisation name</dt>
            <dd>{details.organisationName}</dd>
          </div>
          <div>
            <dt className="font-semibold">Your name</dt>
            <dd>{details.displayName}</dd>
          </div>
          <div>
            <dt className="font-semibold">Your role</dt>
            <dd>Owner</dd>
          </div>
        </dl>
        <input
          type="hidden"
          name="organisationName"
          value={details.organisationName}
        />
        <input type="hidden" name="displayName" value={details.displayName} />
        <Feedback {...state} />
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => setReview(false)}
          >
            Back
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create organisation"}
          </Button>
        </div>
      </form>
    );
  }
  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const organisationName = String(form.get("organisationName")).trim();
        const displayName = String(form.get("displayName")).trim();
        if (organisationName && displayName) {
          setDetails({ organisationName, displayName });
          setReview(true);
        }
      }}
    >
      <h2 className="font-semibold">Step 1 of 2 · Organisation details</h2>
      <Field
        name="organisationName"
        label="Organisation name"
        autoComplete="organization"
        maxLength={120}
        pattern=".*\S.*"
        defaultValue={details.organisationName}
      />
      <Field
        name="displayName"
        label="Your name"
        autoComplete="name"
        maxLength={120}
        pattern=".*\S.*"
        defaultValue={details.displayName}
      />
      <Button type="submit">Review details</Button>
    </form>
  );
}
