// @vitest-environment node

import Stripe from "stripe";
import { afterEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/stripe/webhook/route";

const { db, sdk } = vi.hoisted(() => ({ db: vi.fn(), sdk: vi.fn() }));
vi.mock("./stripe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./stripe")>()),
  billingClient: () => ({ rpc: db }),
  stripeClient: sdk,
}));

const secret = "whsec_syntheticfixture";
const stripe = new Stripe("synthetic-fixture");
const customer = "cus_Fixture";
const price = "price_ProAnnualFixture";
const event = {
  id: "evt_One",
  type: "customer.subscription.updated",
  data: { object: { id: "sub_Fixture", customer, status: "canceled" } },
};
const payload = JSON.stringify(event);
const current = {
  customer,
  status: "active",
  items: {
    has_more: false,
    data: [
      {
        quantity: 1,
        price: {
          id: price,
          currency: "gbp",
          unit_amount: 199000,
          recurring: {
            interval: "year",
            interval_count: 1,
            usage_type: "licensed",
          },
        },
      },
    ],
  },
} as unknown as Stripe.Subscription;

function request(
  body = payload,
  signature = stripe.webhooks.generateTestHeaderString({ payload, secret }),
) {
  return new Request("https://example.com/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sdk.mockReset();
  db.mockReset();
});

it("verifies the raw Stripe signature before any database or provider action", async () => {
  sdk.mockReturnValue(stripe);
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
  expect((await POST(request(payload + " "))).status).toBe(400);
  expect((await POST(request(payload, "t=0,v1=invalid"))).status).toBe(400);
  expect(db).not.toHaveBeenCalled();
});

it("uses current Stripe state for delayed events and replays a signed event without applying it twice", async () => {
  sdk.mockReturnValue(stripe);
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
  vi.stubEnv("STRIPE_PRO_ANNUAL_PRICE_ID", price);
  const retrieve = vi
    .spyOn(stripe.subscriptions, "retrieve")
    .mockResolvedValue(current as Stripe.Response<Stripe.Subscription>);
  const applied = new Set<string>();
  db.mockImplementation(async (name: string, args: { event_id?: string }) => {
    if (name === "begin_stripe_observation")
      return { data: applied.has(args.event_id ?? "") ? null : 17 };
    if (name === "apply_stripe_observation" && args.event_id)
      applied.add(args.event_id);
    return { data: true };
  });
  expect((await POST(request())).status).toBe(204);
  expect((await POST(request())).status).toBe(204);
  expect(retrieve).toHaveBeenCalledExactlyOnceWith("sub_Fixture");
  expect(
    db.mock.calls.filter(([name]) => name === "apply_stripe_observation"),
  ).toEqual([
    [
      "apply_stripe_observation",
      {
        event_id: event.id,
        customer,
        subscription: "sub_Fixture",
        observed_revision: 17,
        observed_plan: "pro",
        observed_status: "active",
      },
    ],
  ]);
});

it("asks Stripe to retry a busy observation and releases a lease on a provider failure", async () => {
  sdk.mockReturnValue(stripe);
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
  const retrieve = vi
    .spyOn(stripe.subscriptions, "retrieve")
    .mockRejectedValue(new Error("Connection failed"));
  db.mockResolvedValueOnce({ error: { code: "55P03" } });
  expect((await POST(request())).status).toBe(503);
  expect(retrieve).not.toHaveBeenCalled();

  db.mockResolvedValueOnce({ data: 21 }).mockResolvedValueOnce({ data: null });
  expect((await POST(request())).status).toBe(503);
  expect(db).toHaveBeenCalledWith("release_stripe_observation", {
    customer,
    revision: 21,
  });
  expect(
    db.mock.calls.some(([name]) => name === "apply_stripe_observation"),
  ).toBe(false);
});
