-- Use only against a disposable database. Prefer the Stripe test flow for billing tests.
update public.organisation_billing
set plan = 'pro'
where organisation_id = :'organisation_id'::uuid and stripe_customer is null;
