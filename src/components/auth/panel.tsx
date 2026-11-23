import Link from "next/link";
import type { ReactNode } from "react";

export function AuthLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="font-medium text-slate-800 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4"
    >
      {children}
    </Link>
  );
}

export function AuthPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
      <section className="grid w-full max-w-md gap-6 rounded-xl border bg-card p-6 text-card-foreground shadow-sm sm:p-8">
        <p className="text-sm font-semibold">
          <AuthLink href="/">SponsorGuard UK</AuthLink>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {children}
      </section>
    </main>
  );
}
