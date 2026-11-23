import type Stripe from "stripe";
import { isRecordId } from "@/lib/people/records";
import { planFromSubscription, type billingClient } from "./stripe";

const subscriptionEvents = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);
const checkoutEvents = new Set([
  "checkout.session.completed",
  "checkout.session.expired",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
]);
const objectId = (value: string | { id: string } | null) =>
  typeof value === "string" ? value : value?.id;

export async function applyStripeWebhook(
  event: Stripe.Event,
  stripe: Stripe,
  db: NonNullable<ReturnType<typeof billingClient>>,
) {
  const checkout = checkoutEvents.has(event.type)
    ? (event.data.object as Stripe.Checkout.Session)
    : null;
  const signedSubscription = subscriptionEvents.has(event.type)
    ? (event.data.object as Stripe.Subscription)
    : null;
  const customer = objectId(
    checkout?.customer ?? signedSubscription?.customer ?? null,
  );
  const subscriptionId = objectId(
    checkout?.subscription ?? signedSubscription ?? null,
  );
  if (!customer || (checkout && checkout.mode !== "subscription")) return;

  if (subscriptionId && event.type !== "checkout.session.expired") {
    const revision = await db.rpc("begin_stripe_observation", {
      event_id: event.id,
      customer,
    });
    if (revision.error) throw new Error("Could not begin Stripe observation.");
    if (revision.data !== null) {
      try {
        let latest: Stripe.Subscription;
        try {
          latest = await stripe.subscriptions.retrieve(subscriptionId);
        } catch (error) {
          if (
            signedSubscription &&
            event.type === "customer.subscription.deleted" &&
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "resource_missing"
          ) {
            latest = signedSubscription;
          } else {
            throw error;
          }
        }
        if (objectId(latest.customer) !== customer)
          throw new Error("Stripe customer mismatch.");
        const applied = await db.rpc("apply_stripe_observation", {
          event_id: event.id,
          customer,
          subscription: subscriptionId,
          observed_revision: revision.data,
          observed_plan: planFromSubscription(latest),
          observed_status: latest.status,
        });
        if (applied.error)
          throw new Error("Could not apply Stripe observation.");
      } finally {
        const released = await db.rpc("release_stripe_observation", {
          customer,
          revision: revision.data,
        });
        if (released.error)
          throw new Error("Could not release Stripe observation.");
      }
    }
  }

  const attempt = checkout?.metadata?.attempt;
  if (attempt && isRecordId(attempt)) {
    const release = await db.rpc("release_stripe_checkout", {
      customer,
      attempt,
    });
    if (release.error) throw new Error("Could not release Stripe checkout.");
  }
}
