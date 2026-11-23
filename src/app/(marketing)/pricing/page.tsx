import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { billingOffers } from "@/lib/billing/model";
import { publicMetadata } from "@/lib/marketing/site";

export const metadata = publicMetadata(
  "Pricing",
  "Compare the free licence health check and the Core and Pro plans for UK sponsor licence holders.",
  "/pricing",
);

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});
const amount = (pence: number) => gbp.format(pence / 100);
const plans = [
  {
    name: "Free",
    monthly: 0,
    annual: null,
    details: ["Licence health-check checklist", "Available without an account"],
    href: "/health-check",
    cta: "Start free health check",
  },
  {
    name: "Core",
    monthly: billingOffers.core_month.pence,
    annual: billingOffers.core_year.pence,
    details: [
      "Up to 20 sponsored workers",
      "Right-to-work records and reporting",
      "Private document vault and audit packs",
      "Passport ledger verification",
    ],
    href: "/sign-up",
    cta: "Create an account for Core",
  },
  {
    name: "Pro",
    monthly: billingOffers.pro_month.pence,
    annual: billingOffers.pro_year.pence,
    details: [
      "Up to 60 sponsored workers",
      "Everything in Core",
      "Expiring Compliance Passport sharing",
      "Continuity Guard",
      "Extended workforce map",
    ],
    href: "/sign-up",
    cta: "Create an account for Pro",
  },
] as const;

export default function PricingPage() {
  return (
    <section className="marketing-wrap marketing-section pricing-page">
      <div className="marketing-intro">
        <h1>Pricing for sponsor teams</h1>
        <p className="marketing-lead">
          Pay monthly, or get 12 months for the price of 10 with annual billing.
        </p>
      </div>
      <div className="marketing-card-grid">
        {plans.map((plan) => (
          <article
            key={plan.name}
            className={`marketing-card pricing-card${plan.name === "Pro" ? " pricing-card-pro" : ""}`}
          >
            <h2>{plan.name}</h2>
            <p className="pricing-price">
              <span>{amount(plan.monthly)}</span> / month
            </p>
            <p className="pricing-annual">
              {plan.annual === null
                ? "Free to use"
                : `${amount(plan.annual)} billed annually`}
            </p>
            <ul>
              {plan.details.map((detail) => (
                <li key={detail}>
                  <Check size={18} aria-hidden="true" />
                  {detail}
                </li>
              ))}
            </ul>
            <Link
              href={plan.href}
              className={`marketing-button ${plan.name === "Pro" ? "marketing-button-on-dark" : "marketing-button-outline"}`}
            >
              {plan.cta} <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </article>
        ))}
      </div>
      <p className="pricing-note">
        Already have a workspace?{" "}
        <Link href="/dashboard">Open SponsorGuard</Link> and choose your plan in
        Billing.
      </p>
    </section>
  );
}
