# Plans and Stripe billing

| Plan | Monthly | Annual | Sponsored worker records |
| ---- | ------: | -----: | -----------------------: |
| Free |      £0 |     £0 |                        0 |
| Core |     £99 |   £990 |                       20 |
| Pro  |    £199 | £1,990 |                       60 |

New workspaces start on Free. The organisation health-check checklist is available to members. Core opens the records workspace, reporting, documents, Passport verification and audit packs. Pro adds Passport sharing, Continuity Guard and the extended workforce map. The worker cap counts active and inactive sponsored worker records. Engaged individuals use the Pro map. Workspaces above a lower cap can read and edit records permitted by the new plan and cannot add sponsored workers until usage falls below the cap or the workspace upgrades.

The organisation owner uses **Billing** to open Stripe Checkout or the Stripe customer portal. A checkout return page shows the app’s current subscription status. Stripe webhooks grant paid access for recognised active or trialling subscriptions. A downgrade retains records, gates plan-specific access and suspends public Passport links without extending their original expiry. Packs generated from Pro-only inputs remain restricted to Pro. Previously issued signed Storage URLs expire normally.

## Set-up

Create recurring, fixed-price GBP products in the Stripe dashboard. Configure monthly and annual prices at the amounts above. Set the four `STRIPE_*_PRICE_ID` environment variables from `.env.example`. Configure the customer portal to allow the desired plan switches, billing intervals, payment method changes and cancellations. Set `STRIPE_PORTAL_CONFIGURATION_ID` to use a specific configuration. Use the appropriate portal and prices for the Stripe mode in use.

Set `BILLING_APP_ORIGIN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and the Supabase service-role configuration. Register `POST /api/stripe/webhook` for the following Stripe events.

- `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused` and `customer.subscription.resumed`
- `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed`

Use the Stripe CLI endpoint secret for local forwarding and the deployed endpoint’s signing secret in production. Keep Stripe secrets server-side. The handler verifies the raw request signature, serialises observations for each bound customer, reads the current subscription from Stripe and atomically records each applied event ID. A failed observation returns a retryable error.

Existing organisations migrate to Free with sponsored-worker counts preserved. Use a paid disposable workspace for the synthetic records seed. Tests assign synthetic paid subscriptions through the local service-role billing functions. The test suite uses Stripe's signed test payloads and a fake Stripe API response.
