import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { authConfig } from "@/lib/auth/config";
import { billingOffers, type OfferKey, type Plan } from "./model";

type BillingDatabase = {
  public: {
    Tables: Record<never, never>;
    Views: Record<never, never>;
    Functions: {
      stripe_customer_for: { Args: { tenant: string }; Returns: string | null };
      bind_stripe_customer: {
        Args: { tenant: string; customer: string };
        Returns: string | null;
      };
      reserve_stripe_checkout: {
        Args: { tenant: string; price: string };
        Returns: { attempt: string; expires_at: string }[];
      };
      begin_stripe_observation: {
        Args: { event_id: string; customer: string };
        Returns: number | null;
      };
      apply_stripe_observation: {
        Args: {
          event_id: string;
          customer: string;
          subscription: string;
          observed_revision: number;
          observed_plan: Plan;
          observed_status: string;
        };
        Returns: boolean;
      };
      release_stripe_observation: {
        Args: { customer: string; revision: number };
        Returns: undefined;
      };
      release_stripe_checkout: {
        Args: { customer: string; attempt: string };
        Returns: undefined;
      };
    };
  };
};

export function stripeClient() {
  const secret = process.env.STRIPE_SECRET_KEY;
  return secret ? new Stripe(secret, { maxNetworkRetries: 2 }) : null;
}

export function billingClient() {
  const auth = authConfig();
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!auth || !service) return null;
  return createClient<BillingDatabase>(auth.url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function stripePrice(key: OfferKey) {
  return process.env[billingOffers[key].env];
}

export function matchesStripePrice(price: Stripe.Price, key: OfferKey) {
  const offer = billingOffers[key];
  return (
    price.id === stripePrice(key) &&
    price.currency === "gbp" &&
    price.unit_amount === offer.pence &&
    price.recurring?.interval === offer.interval &&
    price.recurring.interval_count === 1 &&
    price.recurring.usage_type === "licensed"
  );
}

export function planFromSubscription(subscription: Stripe.Subscription): Plan {
  if (subscription.items.has_more || subscription.items.data.length !== 1)
    return "free";
  const [item] = subscription.items.data;
  const key = (Object.keys(billingOffers) as OfferKey[]).find((offer) =>
    matchesStripePrice(item.price, offer),
  );
  return key && item.quantity === 1 ? billingOffers[key].plan : "free";
}
