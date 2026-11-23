export const billingOffers = {
  core_month: {
    plan: "core",
    interval: "month",
    pence: 9900,
    env: "STRIPE_CORE_MONTHLY_PRICE_ID",
  },
  core_year: {
    plan: "core",
    interval: "year",
    pence: 99000,
    env: "STRIPE_CORE_ANNUAL_PRICE_ID",
  },
  pro_month: {
    plan: "pro",
    interval: "month",
    pence: 19900,
    env: "STRIPE_PRO_MONTHLY_PRICE_ID",
  },
  pro_year: {
    plan: "pro",
    interval: "year",
    pence: 199000,
    env: "STRIPE_PRO_ANNUAL_PRICE_ID",
  },
} as const;
export type OfferKey = keyof typeof billingOffers;
export type Plan = "free" | "core" | "pro";
export type BillingSummary = {
  plan: Plan;
  worker_count: number;
  worker_limit: number;
  has_customer: boolean;
};
export const planNames = { free: "Free", core: "Core", pro: "Pro" };

export const healthChecklist = {
  worker_register:
    "Review the worker register and identify records to collect.",
  right_to_work:
    "Check which right-to-work records and follow-up dates are on file.",
  reporting: "List reporting events and any dates you have recorded.",
  key_personnel: "Review who is recorded for each key personnel role.",
  documents: "Identify documents on file and check recorded expiry dates.",
} as const;
