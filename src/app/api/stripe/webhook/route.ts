import { securityLog } from "@/lib/security/log";
import { billingClient, stripeClient } from "@/lib/billing/stripe";
import { applyStripeWebhook } from "@/lib/billing/webhook";

export async function POST(request: Request) {
  const stripe = stripeClient();
  const signingSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !signingSecret) return new Response(null, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    securityLog({ event: "stripe_webhook", outcome: "rejected" });
    return new Response(null, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      await request.text(),
      signature,
      signingSecret,
    );
  } catch {
    securityLog({ event: "stripe_webhook", outcome: "rejected" });
    return new Response(null, { status: 400 });
  }
  const db = billingClient();
  if (!db) return new Response(null, { status: 503 });
  try {
    await applyStripeWebhook(event, stripe, db);
    return new Response(null, { status: 204 });
  } catch {
    securityLog({ event: "stripe_webhook", outcome: "retry" });
    return new Response(null, { status: 503 });
  }
}
