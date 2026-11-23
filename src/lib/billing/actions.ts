"use server";

import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  requireWorkspaceSession,
  workspaceMemberships,
} from "@/lib/auth/access";
import { isRecordId } from "@/lib/people/records";
import { billingOffers, healthChecklist, type OfferKey } from "./model";
import {
  billingClient,
  matchesStripePrice,
  stripeClient,
  stripePrice,
} from "./stripe";

type State = { error?: string; success?: string };

async function requireBillingOwner(organisation: string) {
  const member = (await workspaceMemberships()).find(
    (row) => row.organisation_id === organisation,
  );
  if (!isRecordId(organisation) || member?.role !== "owner") notFound();
}

function billingReturnUrl(organisation: string) {
  const configured = process.env.BILLING_APP_ORIGIN;
  if (!configured) return null;
  try {
    const origin = new URL(configured);
    if (
      origin.protocol !== "https:" &&
      !(
        origin.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(origin.hostname)
      )
    )
      return null;
    return new URL(`/workspace/${organisation}/billing`, origin).href;
  } catch {
    return null;
  }
}

export async function startCheckout(
  organisation: string,
  _: State,
  form: FormData,
): Promise<State> {
  await requireBillingOwner(organisation);
  const raw = form.get("offer");
  if (typeof raw !== "string" || !Object.hasOwn(billingOffers, raw))
    return { error: "Choose a plan and billing frequency." };
  const offer = raw as OfferKey;
  const price = stripePrice(offer);
  const stripe = stripeClient();
  const db = billingClient();
  const returnUrl = billingReturnUrl(organisation);
  if (!stripe || !db || !returnUrl || !price)
    return { error: "Checkout is temporarily unavailable." };

  let url: string;
  try {
    const priceInfo = await stripe.prices.retrieve(price);
    if (!priceInfo.active || !matchesStripePrice(priceInfo, offer))
      return { error: "This price is temporarily unavailable." };
    const existing = await db.rpc("stripe_customer_for", {
      tenant: organisation,
    });
    if (existing.error) throw new Error("Customer lookup failed.");
    let customer = existing.data;
    if (!customer) {
      const created = await stripe.customers.create(
        { metadata: { organisation_id: organisation } },
        { idempotencyKey: `sponsorguard-customer/${organisation}` },
      );
      const bound = await db.rpc("bind_stripe_customer", {
        tenant: organisation,
        customer: created.id,
      });
      if (bound.error || !bound.data)
        throw new Error("Customer binding failed.");
      customer = bound.data;
    }
    const subscriptions = await stripe.subscriptions.list({
      customer,
      status: "all",
      limit: 100,
    });
    if (
      subscriptions.has_more ||
      subscriptions.data.some(
        (subscription) =>
          subscription.status !== "canceled" &&
          subscription.status !== "incomplete_expired",
      )
    )
      return {
        error:
          "A Stripe subscription is already on file. Manage your plan in the customer portal.",
      };
    const { data, error } = await db.rpc("reserve_stripe_checkout", {
      tenant: organisation,
      price,
    });
    if (error) throw new Error("Checkout reservation failed.");
    const reservation = data[0];
    if (!reservation)
      return {
        error:
          "A subscription or checkout is already open. Use the customer portal for an existing subscription or return after the open checkout expires.",
      };

    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer,
        client_reference_id: organisation,
        line_items: [{ price, quantity: 1 }],
        metadata: { attempt: reservation.attempt },
        success_url: `${returnUrl}?checkout=returned`,
        cancel_url: returnUrl,
        expires_at: Math.floor(Date.parse(reservation.expires_at) / 1000),
      },
      { idempotencyKey: `sponsorguard-checkout/${reservation.attempt}` },
    );
    if (!session.url)
      return {
        error:
          "This checkout has ended. Refresh billing to see the current status.",
      };
    url = session.url;
  } catch {
    return { error: "Could not open Stripe Checkout. Try again." };
  }
  redirect(url);
}

export async function openBillingPortal(organisation: string): Promise<State> {
  await requireBillingOwner(organisation);
  const stripe = stripeClient();
  const db = billingClient();
  const returnUrl = billingReturnUrl(organisation);
  if (!stripe || !db || !returnUrl)
    return { error: "The customer portal is temporarily unavailable." };
  let url: string;
  try {
    const customer = await db.rpc("stripe_customer_for", {
      tenant: organisation,
    });
    if (customer.error || !customer.data)
      return { error: "No Stripe customer is on file for this workspace." };
    const session = await stripe.billingPortal.sessions.create({
      customer: customer.data,
      return_url: returnUrl,
      configuration: process.env.STRIPE_PORTAL_CONFIGURATION_ID,
    });
    url = session.url;
  } catch {
    return { error: "Could not open the customer portal. Try again." };
  }
  redirect(url);
}

export async function saveHealthChecklist(
  organisation: string,
  _: State,
  form: FormData,
): Promise<State> {
  const { client } = await requireWorkspaceSession();
  if (!isRecordId(organisation))
    return { error: "Could not save the checklist." };
  const checked = Object.keys(healthChecklist).filter(
    (key) => form.get(key) === "on",
  );
  const { error } = await client.rpc("save_health_checklist", {
    tenant: organisation,
    checked,
  });
  if (error) return { error: "Could not save the checklist." };
  revalidatePath(`/workspace/${organisation}/dashboard`);
  return { success: "Checklist saved." };
}
