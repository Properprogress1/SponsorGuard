import type { Metadata } from "next";
import { PublicPassport } from "@/components/passport/public";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Shared Compliance Passport | SponsorGuard UK",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function SharePage() {
  return (
    <main className="mx-auto my-8 grid min-h-[70vh] max-w-3xl content-start gap-6 rounded-2xl border bg-card px-6 py-10 sm:px-12">
      <header className="grid gap-2">
        <p className="font-semibold text-muted-foreground">SponsorGuard UK</p>
        <h1 className="text-3xl font-semibold tracking-tight text-primary">
          Shared Compliance Passport
        </h1>
        <p className="text-sm text-muted-foreground">
          SponsorGuard tracks your records. It does not provide immigration
          advice or guarantee compliance.
        </p>
      </header>
      <PublicPassport />
    </main>
  );
}
