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
    <main className="mx-auto grid min-h-screen max-w-3xl content-start gap-6 px-5 py-12">
      <header className="grid gap-2">
        <p className="font-semibold text-slate-700">SponsorGuard UK</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Shared Compliance Passport
        </h1>
        <p className="text-sm text-slate-700">
          SponsorGuard tracks your records. It does not provide immigration
          advice or guarantee compliance.
        </p>
      </header>
      <PublicPassport />
    </main>
  );
}
