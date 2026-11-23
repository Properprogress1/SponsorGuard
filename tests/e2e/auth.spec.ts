import { writeFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import { createHmac, randomUUID } from "node:crypto";
import {
  expect as playwrightExpect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const password = "SponsorGuard-e2e-password-1";
const base32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const expect = playwrightExpect.configure({ timeout: 15_000 });
const vaultBucket = "sponsorguard-documents";

function otp(secret: string) {
  const bits = [...secret.toUpperCase().replaceAll("=", "")]
    .map((character) => base32.indexOf(character).toString(2).padStart(5, "0"))
    .join("");
  const bytes = Buffer.from(
    (bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", bytes).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return String(
    (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000,
  ).padStart(6, "0");
}

function fixtureClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      "Auth tests require local Supabase URL and service-role key.",
    );
  if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname)) {
    throw new Error("Auth fixtures require a local Supabase instance.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function fixturePlan(
  service: ReturnType<typeof fixtureClient>,
  organisation: string,
  plan: "core" | "pro" = "pro",
) {
  const marker = organisation.replaceAll("-", "");
  const customer = `cus_fixture${marker}`;
  const event = `evt_fixture${marker}`;
  const bound = await service.rpc("bind_stripe_customer", {
    tenant: organisation,
    customer,
  });
  const claim = await service.rpc("begin_stripe_observation", {
    event_id: event,
    customer,
  });
  if (bound.error || claim.error || !claim.data)
    throw new Error("Could not reserve synthetic billing fixture.");
  const change = await service.rpc("apply_stripe_observation", {
    event_id: event,
    customer,
    subscription: `sub_fixture${marker}`,
    observed_revision: claim.data,
    observed_plan: plan,
    observed_status: "active",
  });
  const released = await service.rpc("release_stripe_observation", {
    customer,
    revision: claim.data,
  });
  if (change.error || released.error || !change.data)
    throw new Error("Could not set synthetic billing fixture.");
}

function fixtureEmail() {
  return `test-${randomUUID()}@example.com`;
}

async function emailLink(
  request: APIRequestContext,
  email: string,
  subject: string,
) {
  const mailbox =
    process.env.SPONSORGUARD_MAILPIT_URL ?? "http://127.0.0.1:54324";
  let messageId: string | undefined;
  await expect
    .poll(
      async () => {
        const response = await request.get(`${mailbox}/api/v1/search`, {
          params: { query: `to:${email}` },
        });
        if (!response.ok()) return false;
        const body: { messages?: { ID: string; Subject: string }[] } =
          await response.json();
        messageId = body.messages?.find(
          (message) => message.Subject === subject,
        )?.ID;
        return Boolean(messageId);
      },
      { timeout: 20_000 },
    )
    .toBe(true);

  const response = await request.get(`${mailbox}/api/v1/message/${messageId}`);
  const message: { HTML: string } = await response.json();
  const link = message.HTML.match(/href="([^"]*\/auth\/confirm\?[^"]+)"/)?.[1];
  if (!link) throw new Error("No confirmation link found in the test email.");
  const { pathname, search } = new URL(link.replaceAll("&amp;", "&"));
  return pathname + search;
}

async function signIn(page: Page, email: string, credential = password) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(credential);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function enrol(page: Page) {
  await expect(page).toHaveURL(/\/mfa$/);
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  const key = page.getByLabel("Setup key");
  await expect(key).toBeVisible();
  const secret = (await key.textContent())?.trim();
  if (!secret) throw new Error("No setup key was supplied.");

  const firstCode = otp(secret);
  await page
    .getByLabel("Authenticator code")
    .fill(firstCode === "123456" ? "123457" : "123456");
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "could not be verified",
  );
  await page.getByLabel("Authenticator code").fill(otp(secret));
  await page.getByRole("button", { name: "Verify code" }).click();
  return secret;
}

test("onboard an owner with TOTP and manage People records with atomic CSV import", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const email = fixtureEmail();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/sign-up");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");
  await page.goto(
    await emailLink(request, email, "Confirm your SponsorGuard email"),
  );
  await page.getByRole("button", { name: "Confirm email" }).click();
  await expect(page).toHaveURL(/\/mfa$/);
  await page.goto("/onboarding");
  await enrol(page);

  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("Organisation name").fill("Northbridge Example");
  await page.getByLabel("Your name").fill("Example Owner");
  await page.getByRole("button", { name: "Review details" }).click();
  await expect(
    page.getByRole("heading", { name: "Step 2 of 2 · Review details" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Create organisation" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(
    page.getByText("Northbridge Example", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Owner", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Health-check checklist", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: /Review the worker register/ })
    .check();
  await page.getByRole("button", { name: "Save checklist" }).click();
  await expect(page.getByText("Checklist saved.")).toBeVisible();
  await page.getByRole("link", { name: "Billing", exact: true }).click();
  await expect(page.getByText("£99/month", { exact: true })).toBeVisible();
  await expect(page.getByText("£199/month", { exact: true })).toBeVisible();
  const tenant = new URL(page.url()).pathname.split("/")[2];
  await page.goto(`/workspace/${tenant}/people`);
  await expect(page.getByText("Available on Core and Pro")).toBeVisible();
  await fixturePlan(fixtureClient(), tenant);
  await page.reload();
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  await page.getByRole("link", { name: "People", exact: true }).click();
  await expect(
    page.getByText("0 records on file", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Import CSV" }).click();

  async function chooseCsv(contents: string) {
    await page.getByLabel("CSV file").setInputFiles({
      name: "synthetic-people.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(contents),
    });
    await page.getByRole("button", { name: "Read columns" }).click();
  }

  await chooseCsv(
    'Reference,Full name,Status\nSIM-1,Synthetic One,active\nSIM-2,"Unclosed',
  );
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Malformed CSV",
  );

  await chooseCsv(
    "Reference,Full name,Status\nSIM-1,Synthetic One,active\nSIM-2,Synthetic Two,unknown",
  );
  await page.getByRole("button", { name: "Import records" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "CSV record 3",
  );
  await page.getByRole("link", { name: "Back to sponsored workers" }).click();
  await expect(
    page.getByText("0 records on file", { exact: true }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Import CSV" }).click();
  await chooseCsv(
    "Ref,Person,State\nSIM-1,Synthetic One,active\nSIM-2,Synthetic Two,active",
  );
  await page.getByLabel("Full name").selectOption("1");
  await page.getByLabel("Reference").selectOption("0");
  await page.getByLabel("Status", { exact: true }).selectOption("2");
  await page.getByRole("button", { name: "Import records" }).click();
  await expect(page.getByRole("status")).toContainText("2 records imported");
  await page.getByRole("link", { name: "Back to sponsored workers" }).click();
  await expect(
    page.getByText("2 records on file", { exact: true }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Import CSV" }).click();
  await chooseCsv(
    "Reference,Full name,Status\nSIM-NEW,Synthetic New,active\nSIM-1,Synthetic Duplicate,active",
  );
  await page.getByRole("button", { name: "Import records" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "The batch was rejected",
  );
  await page.getByRole("link", { name: "Back to sponsored workers" }).click();
  await expect(
    page.getByText("2 records on file", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Synthetic New" })).toHaveCount(
    0,
  );

  await page.getByRole("link", { name: "Synthetic One" }).click();
  await page.getByRole("link", { name: "Edit record" }).click();
  await page.getByLabel("Status", { exact: true }).selectOption("inactive");
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(page.getByRole("status")).toContainText("Record saved");
  const workerId = new URL(page.url()).searchParams.get("record");
  if (!workerId) throw new Error("Expected a saved worker record ID.");
  await page.getByRole("link", { name: "Back to sponsored workers" }).click();
  await page.getByLabel("Status", { exact: true }).selectOption("inactive");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(
    page.getByText("1 record on file matching these filters"),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Synthetic Two" })).toHaveCount(
    0,
  );

  await page.getByRole("link", { name: "Add record" }).click();
  await expect(
    page.getByRole("heading", { name: "Add sponsored worker" }),
  ).toBeVisible();
  await page.getByLabel("Full name").fill("Synthetic Manual Worker");
  await page.getByLabel("Reference").fill("SIM-MANUAL");
  await page.getByLabel("Status", { exact: true }).selectOption("active");
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(page.getByRole("status")).toContainText("Record saved");
  await expect(
    page.getByRole("heading", { name: "Synthetic Manual Worker" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to sponsored workers" }).click();

  await page.getByRole("link", { name: "CoS records", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "CoS records", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Add record" }).click();
  await expect(
    page.getByRole("heading", { name: "Add CoS record" }),
  ).toBeVisible();
  await page.getByLabel("Reference").fill("SIM-COS-1");
  await page.getByLabel("Sponsored worker", { exact: true }).fill(workerId);
  await page.getByLabel("Assigned date").fill("01/12/2020");
  await page.getByLabel("Status", { exact: true }).selectOption("assigned");
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(page.getByRole("heading", { name: "SIM-COS-1" })).toBeVisible();
  await page
    .getByRole("link", { name: "Back to CoS records", exact: true })
    .click();

  await page
    .getByRole("link", { name: "Right to work checks", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Right to work checks", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Add record" }).click();
  await expect(
    page.getByRole("heading", { name: "Add right to work check" }),
  ).toBeVisible();
  await page
    .getByLabel("Sponsored worker (optional)", { exact: true })
    .fill(workerId);
  await page.getByLabel("Check date", { exact: true }).fill("01/12/2020");
  await page.getByLabel("Check method").selectOption("online");
  await page
    .getByLabel("Follow-up date (optional)", { exact: true })
    .fill("02/12/2020");
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(page.getByText("Follow-up due", { exact: true })).toBeVisible();
  await expect(page.getByText("02/12/2020", { exact: true })).toBeVisible();

  await page
    .getByRole("link", { name: "Back to right to work checks" })
    .click();
  await page
    .getByRole("link", { name: "Engaged individuals", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Engaged individuals", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Add record" }).click();
  await expect(
    page.getByRole("heading", { name: "Add engaged individual" }),
  ).toBeVisible();
  await page.getByLabel("Full name").fill("Synthetic Platform Individual");
  await page.getByLabel("Reference").fill("SIM-EI-1");
  await page.getByLabel("Engagement type").selectOption("platform");
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(
    page.getByRole("heading", { name: "Synthetic Platform Individual" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Reporting", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Reporting", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Event date").fill("02/04/2026");
  await page.getByLabel("Reporting rule").selectOption("worker_circumstances");
  await page.getByRole("button", { name: "Record event" }).click();
  await expect(page.getByRole("status")).toContainText("task created");
  const event = page.getByRole("row", { name: /Change in a sponsored worker/ });
  await expect(event).toContainText("20/04/2026");
  await expect(event).toContainText("Overdue");
  await expect(event).toContainText("VERIFY");

  await page.getByRole("link", { name: "View tasks" }).click();
  await expect(
    page.getByRole("heading", { name: "Tasks", exact: true }),
  ).toBeVisible();
  const task = page.getByRole("row", { name: /Change in a sponsored worker/ });
  await expect(task).toContainText("Overdue");
  await task.getByRole("button", { name: "Mark complete" }).click();
  await expect(task).toContainText("Completed");
  await page
    .getByRole("navigation", { name: "Deadline filters" })
    .getByRole("link", { name: "Completed" })
    .click();
  await expect(page.getByText("1 task matching this filter")).toBeVisible();
  await page.getByRole("link", { name: "Passport", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ledger integrity" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Chain verified");
  await expect(page.getByRole("status")).toContainText("2 entries checked");
});

test("viewer can sign in and complete TOTP but cannot open admin routes", async ({
  page,
}) => {
  const admin = fixtureClient();
  const email = fixtureEmail();
  const { data: account, error: userError } = await admin.auth.admin.createUser(
    { email, password, email_confirm: true },
  );
  if (userError || !account.user)
    throw new Error("Could not create the viewer fixture.");
  const { data: organisations, error: orgError } = await admin
    .from("organisations")
    .insert([{ name: "Viewer Example" }, { name: "Separate Example" }])
    .select("id, name");
  const organisation = organisations?.find(
    ({ name }) => name === "Viewer Example",
  );
  const other = organisations?.find(({ name }) => name === "Separate Example");
  if (orgError || !organisation || !other)
    throw new Error("Could not create the organisation fixture.");
  const { error: membershipError } = await admin.from("memberships").insert({
    organisation_id: organisation.id,
    user_id: account.user.id,
    role: "viewer",
  });
  if (membershipError)
    throw new Error("Could not create the viewer membership.");

  await fixturePlan(admin, organisation.id);
  await signIn(page, email);
  await enrol(page);
  const path = `/workspace/${organisation.id}`;
  await expect(page).toHaveURL(`${path}/dashboard`);
  await expect(page.getByText("Viewer", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
  for (const section of ["settings", "key-personnel"]) {
    await page.goto(`${path}/${section}`);
    await expect(page).toHaveURL(`${path}/dashboard`);
  }
  await page.goto(`/workspace/${other.id}/dashboard`);
  await expect(page.getByRole("heading", { name: /404/ })).toBeVisible();
  await page.goto(`${path}/dashboard`);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page, email);
  await expect(
    page.getByRole("heading", { name: "Verify your authenticator" }),
  ).toBeVisible();
  await page.goto(`${path}/settings`);
  await expect(page).toHaveURL(/\/mfa$/);
});

test("password recovery changes the password and preserves mandatory MFA", async ({
  page,
  request,
}) => {
  const email = fixtureEmail();
  const { error } = await fixtureClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error("Could not create the recovery fixture.");

  await page.goto("/reset-password");
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText(
    "we’ll send a reset link",
  );
  await page.goto(
    await emailLink(request, email, "Reset your SponsorGuard password"),
  );
  await page
    .getByRole("button", { name: "Continue to password reset" })
    .click();
  await expect(page).toHaveURL(/\/reset-password$/);

  const newPassword = "SponsorGuard-e2e-password-2";
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm new password").fill(newPassword);
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page).toHaveURL(/\/mfa$/);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await signIn(page, email);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Sign-in failed",
  );
  await signIn(page, email, newPassword);
  await expect(page).toHaveURL(/\/mfa$/);
});

async function vaultFixture(
  admin: ReturnType<typeof fixtureClient>,
  name: string,
) {
  const { data: organisation, error: organisationError } = await admin
    .from("organisations")
    .insert({ name })
    .select("id")
    .single();
  if (organisationError || !organisation)
    throw new Error("Could not set up the vault test organisation.");
  await fixturePlan(admin, organisation.id);
  const { data: worker, error: workerError } = await admin
    .from("sponsored_workers")
    .insert({
      organisation_id: organisation.id,
      full_name: "Synthetic Vault Worker",
      reference: "VAULT-1",
      status: "active",
    })
    .select("id")
    .single();
  if (workerError || !worker)
    throw new Error("Could not set up the vault test worker.");
  return { organisation: organisation.id, worker: worker.id };
}

test("document validation and organisation-scoped Storage signing", async ({
  page,
  request,
}) => {
  const service = fixtureClient();
  const email = fixtureEmail();
  const { data: account, error: userError } =
    await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (userError || !account.user)
    throw new Error("Could not create the vault test user.");
  const { organisation, worker } = await vaultFixture(
    service,
    "Synthetic Vault Test",
  );
  const { error: membershipError } = await service.from("memberships").insert({
    organisation_id: organisation,
    user_id: account.user.id,
    role: "hr_user",
  });
  if (membershipError) throw new Error("Could not assign the vault test user.");

  await signIn(page, email);
  await enrol(page);
  await expect(page).toHaveURL(`/workspace/${organisation}/dashboard`);
  await page.getByRole("link", { name: "Documents", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Document vault" }),
  ).toBeVisible();
  await page.getByLabel("Document type").selectOption("identity");
  await page.getByLabel("Person", { exact: true }).fill(worker);
  await page.getByLabel("Document file").setInputFiles({
    name: "mismatched.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("mismatched test content"),
  });
  await page.getByRole("button", { name: "Upload document" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "do not match",
  );
  await expect(
    page.getByText("0 documents on file", { exact: true }),
  ).toBeVisible();

  if (process.env.SPONSORGUARD_STORAGE_E2E !== "1") return;

  const pdf = Buffer.from("%PDF-1.4\n% Synthetic document fixture\n%%EOF\n");
  await page.getByLabel("Document file").setInputFiles({
    name: "fixture.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await page.getByRole("button", { name: "Upload document" }).click();
  await expect(page.getByRole("status")).toContainText("Document uploaded");
  await expect(page.getByText("Scan not run")).toBeVisible();
  const downloadPath = await page
    .getByRole("link", { name: "Download", exact: true })
    .getAttribute("href");
  if (!downloadPath) throw new Error("Could not find a download link.");
  const signed = await page.request.get(downloadPath, { maxRedirects: 0 });
  expect(signed.status()).toBe(303);
  expect(signed.headers()["cache-control"]).toContain("no-store");
  const bytes = await request.get(signed.headers()["location"]);
  expect(bytes.ok()).toBe(true);
  expect(bytes.headers()["content-disposition"]).toContain("document.pdf");
  expect((await bytes.body()).equals(pdf)).toBe(true);

  const foreign = await vaultFixture(service, "Synthetic Separate Vault");
  const foreignId = randomUUID();
  const foreignPath = `${foreign.organisation}/${foreignId}`;
  const { error: metadataError } = await service.from("documents").insert({
    id: foreignId,
    organisation_id: foreign.organisation,
    sponsored_worker_id: foreign.worker,
    document_type: "identity",
    content_type: "application/pdf",
    size_bytes: pdf.length,
    scan_status: "not_scanned",
    state: "ready",
  });
  const { error: fileError } = await service.storage
    .from(vaultBucket)
    .upload(foreignPath, pdf, { contentType: "application/pdf" });
  if (metadataError || fileError)
    throw new Error("Could not prepare the foreign document fixture.");

  const denied = await page.request.get(
    `/workspace/${foreign.organisation}/documents/download/${foreignId}`,
    { maxRedirects: 0 },
  );
  expect(denied.status()).toBe(404);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing local Storage settings.");
  const cookies = await page.context().cookies();
  const member = createServerClient(url, key, {
    cookies: { getAll: () => cookies, setAll: () => {} },
  });
  const ownObjectPath = `${organisation}/${downloadPath.split("/").at(-1)}`;
  const { error: ownSigningError } = await member.storage
    .from(vaultBucket)
    .createSignedUrl(ownObjectPath, 60);
  expect(Boolean(ownSigningError)).toBe(false);
  const { data: foreignSigned, error: forbidden } = await member.storage
    .from(vaultBucket)
    .createSignedUrl(foreignPath, 60);
  expect(Boolean(forbidden)).toBe(true);
  expect(foreignSigned).toBeNull();
  const anonymous = await request.get(
    `${url}/storage/v1/object/public/${vaultBucket}/${foreignPath}`,
  );
  expect(anonymous.ok()).toBe(false);
  await page.getByRole("link", { name: "Passport", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Chain verified");
  await expect(page.getByRole("status")).toContainText("1 entry checked");
});

test("share a scoped Passport with a passcode and revoke anonymous access", async ({
  browser,
  page,
}) => {
  const service = fixtureClient();
  const email = fixtureEmail();
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user)
    throw new Error("Could not create share test owner.");
  const { organisation, worker } = await vaultFixture(
    service,
    "Synthetic Share Test",
  );
  const outside = await service
    .from("sponsored_workers")
    .insert({
      organisation_id: organisation,
      full_name: "Synthetic Worker Outside Scope",
      reference: "VAULT-2",
      status: "active",
    })
    .select("id")
    .single();
  if (outside.error) throw new Error("Could not create out-of-scope worker.");
  const fixtures = await Promise.all([
    service.from("memberships").insert({
      organisation_id: organisation,
      user_id: data.user.id,
      role: "owner",
    }),
    service.from("rtw_checks").insert(
      [worker, outside.data.id].map((id) => ({
        organisation_id: organisation,
        sponsored_worker_id: id,
        checked_on: "2026-07-10",
        method: "manual",
      })),
    ),
  ]);
  if (fixtures.some((fixture) => fixture.error)) {
    throw new Error("Could not set up the Passport test records.");
  }

  await signIn(page, email);
  await enrol(page);
  await expect(page).toHaveURL(`/workspace/${organisation}/dashboard`);
  await page.getByRole("link", { name: "Passport", exact: true }).click();
  await page.getByLabel("Scope", { exact: true }).selectOption("people");
  await page.getByRole("checkbox", { name: /Synthetic Vault Worker/ }).check();
  await page.getByLabel("Expiry date").fill("31/12/2099");
  await page.getByLabel("Passcode (optional)").fill("synthetic-passcode-17");
  await page.getByRole("button", { name: "Create share link" }).click();
  const linkField = page.getByRole("textbox", { name: "New share link" });
  await expect(linkField).toHaveValue(/\/share#[A-Za-z0-9_-]{43}$/);
  const context = await browser.newContext();
  try {
    const viewer = await context.newPage();
    const response = await viewer.goto(await linkField.inputValue());
    expect(response).not.toBeNull();
    expect(new URL(response?.request().url() ?? "").pathname).toBe("/share");
    await expect(
      viewer.getByText(
        "SponsorGuard tracks your records. It does not provide immigration advice or guarantee compliance.",
      ),
    ).toBeVisible();
    await expect(viewer.getByRole("list")).toHaveCount(0);
    await viewer
      .getByLabel("Passcode", { exact: true })
      .fill("incorrect-passcode");
    await viewer.getByRole("button", { name: "Open Passport" }).click();
    await expect(viewer.getByRole("main").getByRole("alert")).toContainText(
      "incorrect",
    );
    await viewer
      .getByLabel("Passcode", { exact: true })
      .fill("synthetic-passcode-17");
    await viewer.getByRole("button", { name: "Open Passport" }).click();
    await expect(viewer.getByRole("listitem")).toHaveCount(1);
    await expect(viewer.getByRole("listitem")).toContainText(
      "Right-to-work check",
    );
    await expect(viewer.getByText(/Synthetic .*Worker/)).toHaveCount(0);

    await page.reload();
    await expect(page.getByText("Opened", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Revoke link" }).click();
    await expect(page.getByText("Selected people · Revoked")).toBeVisible();
    await viewer.reload();
    await expect(viewer.getByRole("main").getByRole("alert")).toHaveText(
      "This share link is unavailable.",
    );
  } finally {
    await context.close();
  }
});

test("self-report SMS details, see inactivity, and complete a departure task", async ({
  page,
}) => {
  const service = fixtureClient();
  const email = fixtureEmail();
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user)
    throw new Error("Could not create the personnel test owner.");
  const { organisation } = await vaultFixture(
    service,
    "Synthetic Continuity Test",
  );
  const membership = await service.from("memberships").insert({
    organisation_id: organisation,
    user_id: data.user.id,
    role: "owner",
  });
  if (membership.error)
    throw new Error("Could not assign the personnel test owner.");

  await signIn(page, email);
  await enrol(page);
  await expect(page).toHaveURL(`/workspace/${organisation}/dashboard`);
  await page.getByRole("link", { name: "Key Personnel", exact: true }).click();
  await expect(page.getByText("Key Contact is unfilled.")).toBeVisible();

  const add = page.getByRole("region", { name: "Add key personnel" });
  await add.getByLabel("Name (self-reported)").fill("Synthetic Key Contact");
  await add.getByLabel("Role (self-reported)").selectOption("Key Contact");
  await add
    .getByLabel("SMS MFA status (self-reported)")
    .selectOption("enabled");
  await add.getByLabel(/Last SMS login date/).fill("01/01/2020");
  await add.getByRole("button", { name: "Add key person" }).click();
  await expect(
    page.getByText(/Inactive based on the self-reported/),
  ).toBeVisible();
  await expect(page.getByText("Key Contact is unfilled.")).toHaveCount(0);

  await page.getByText("Edit Synthetic Key Contact", { exact: true }).click();
  const record = page
    .getByRole("article")
    .filter({ hasText: "Synthetic Key Contact" });
  await record.getByLabel("Leaving (self-reported)").check();
  await record.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Key Contact is unfilled.")).toBeVisible();
  await page.getByRole("link", { name: "View handover tasks" }).click();
  const checklist = page.getByRole("region", {
    name: "Key personnel handover tasks",
  });
  await expect(checklist.getByRole("listitem")).toHaveCount(3);
  const task = checklist
    .getByRole("listitem")
    .filter({ hasText: "Identify a replacement or confirm cover" });
  await task.getByRole("button", { name: /^Complete task/ }).click();
  await expect(
    task.getByRole("button", { name: /^Reopen task/ }),
  ).toBeVisible();
});

test("configure an engagement category, filter the workforce and export matching rows", async ({
  page,
}) => {
  const service = fixtureClient();
  const email = fixtureEmail();
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user)
    throw new Error("Could not create the workforce test owner.");
  const { organisation } = await vaultFixture(
    service,
    "Synthetic Workforce Test",
  );
  const other = await vaultFixture(service, "Synthetic Foreign Workforce");
  const fixtures = await Promise.all([
    service.from("memberships").insert({
      organisation_id: organisation,
      user_id: data.user.id,
      role: "owner",
    }),
    service.from("engaged_individuals").insert([
      {
        organisation_id: organisation,
        full_name: "Synthetic Missing Check",
        reference: "LOCAL-B",
        engagement_type: "employee",
      },
      {
        organisation_id: other.organisation,
        full_name: "Synthetic Foreign Person",
        reference: "FOREIGN-A",
        engagement_type: "employee",
      },
    ]),
  ]);
  if (fixtures.some((result) => result.error))
    throw new Error("Could not seed the workforce test.");

  await signIn(page, email);
  await enrol(page);
  await expect(page).toHaveURL(`/workspace/${organisation}/dashboard`);
  await page.getByRole("link", { name: "Workforce", exact: true }).click();
  await page.getByText("Manage engagement categories", { exact: true }).click();
  await page.getByLabel(/Category identifier/).fill("seasonal-worker");
  await page
    .getByLabel("Category label", { exact: true })
    .fill("Seasonal workers");
  await page.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByText("Category saved.")).toBeVisible();

  await page.getByRole("link", { name: "People", exact: true }).click();
  await page
    .getByRole("link", { name: "Engaged individuals", exact: true })
    .click();
  await expect(page).toHaveURL(/category=individuals$/);
  await page.getByRole("link", { name: "Add record" }).click();
  await expect(
    page.getByRole("heading", { name: "Add engaged individual" }),
  ).toBeVisible();
  await page.getByLabel("Full name").fill("Synthetic Seasonal Person");
  await page.getByLabel("Reference", { exact: true }).fill("LOCAL-A");
  await page
    .getByLabel("Engagement type", { exact: true })
    .selectOption("seasonal-worker");
  await page
    .getByLabel("Recorded responsibility for checks")
    .fill("Operations");
  await page.getByRole("button", { name: /Save/ }).click();
  await expect(page.getByText("Record saved.")).toBeVisible();
  const person = await service
    .from("engaged_individuals")
    .select("id")
    .eq("organisation_id", organisation)
    .eq("reference", "LOCAL-A")
    .single();
  if (person.error) throw new Error("Could not find the new workforce person.");
  const check = await service.from("rtw_checks").insert({
    organisation_id: organisation,
    engaged_individual_id: person.data.id,
    checked_on: "2020-01-01",
    follow_up_on: "2020-06-01",
    method: "manual",
  });
  if (check.error) throw new Error("Could not seed the workforce check.");

  await page.goto(`/workspace/${organisation}/workforce`);
  await expect(
    page.getByRole("heading", { name: "Seasonal workers" }),
  ).toBeVisible();
  await expect(page.getByText("Synthetic Missing Check")).toBeVisible();
  await page
    .getByRole("combobox", { name: "Engagement category", exact: true })
    .selectOption("seasonal-worker");
  await page
    .getByRole("combobox", { name: "Check status", exact: true })
    .selectOption("due");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText("Synthetic Missing Check")).toHaveCount(0);
  await expect(page.getByText("01/06/2020")).toBeVisible();
  const href = await page
    .getByRole("link", { name: "Export CSV" })
    .getAttribute("href");
  if (!href) throw new Error("Could not find the CSV export.");
  const exportResponse = await page.request.get(href);
  expect(exportResponse.ok()).toBe(true);
  expect(exportResponse.headers()["cache-control"]).toBe("private, no-store");
  const csv = await exportResponse.text();
  expect(csv).toContain(
    '"Synthetic Seasonal Person","LOCAL-A","Seasonal workers","Operations","Follow-up due","01/01/2020","01/06/2020"',
  );
  expect(csv).not.toContain("LOCAL-B");
  const unfiltered = await page.request.get(
    `/workspace/${organisation}/workforce/export`,
  );
  expect(await unfiltered.text()).toContain("LOCAL-B");
  expect(
    await page.request
      .get(`/workspace/${other.organisation}/workforce/export`)
      .then((result) => result.status()),
  ).toBe(404);
});

test("a viewer can opt in to digest emails and save topic preferences", async ({
  page,
}) => {
  const service = fixtureClient();
  const email = fixtureEmail();
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user)
    throw new Error("Could not create the notification test viewer.");
  const { organisation } = await vaultFixture(
    service,
    "Synthetic Notification Test",
  );
  const { error: membershipError } = await service.from("memberships").insert({
    organisation_id: organisation,
    user_id: data.user.id,
    role: "viewer",
  });
  if (membershipError)
    throw new Error("Could not assign the notification test viewer.");

  await signIn(page, email);
  await enrol(page);
  await expect(page).toHaveURL(`/workspace/${organisation}/dashboard`);
  await page.getByRole("link", { name: "Notifications", exact: true }).click();
  const enabled = page.getByRole("checkbox", {
    name: "Send me a daily records digest by email",
  });
  const documents = page.getByRole("checkbox", {
    name: "Document expiry reminders",
  });
  await expect(enabled).not.toBeChecked();
  await expect(documents).toBeChecked();
  await enabled.check();
  await documents.uncheck();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Notification preferences saved.")).toBeVisible();
  await page.reload();
  await expect(enabled).toBeChecked();
  await expect(documents).not.toBeChecked();
  await enabled.uncheck();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Notification preferences saved.")).toBeVisible();
  await page.reload();
  await expect(enabled).not.toBeChecked();
});

test("generate and download a tenant-isolated audit pack from synthetic records", async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.SPONSORGUARD_STORAGE_E2E !== "1",
    "Requires local Supabase Storage.",
  );
  const service = fixtureClient();
  const email = fixtureEmail();
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user)
    throw new Error("Could not create the audit pack test owner.");
  const { organisation, worker } = await vaultFixture(
    service,
    "Synthetic Audit Pack",
  );
  const foreign = await vaultFixture(service, "Foreign Synthetic Audit Pack");
  const fixtures = await Promise.all([
    service.from("memberships").insert({
      organisation_id: organisation,
      user_id: data.user.id,
      role: "owner",
    }),
    service.from("rtw_checks").insert({
      organisation_id: organisation,
      sponsored_worker_id: worker,
      checked_on: "2026-07-01",
      follow_up_on: "2026-12-01",
      method: "manual",
    }),
    service.from("key_personnel").insert({
      organisation_id: organisation,
      full_name: "Synthetic Pack Contact",
      role: "Key Contact",
    }),
    service.from("reporting_events").insert({
      organisation_id: organisation,
      rule_key: "worker_circumstances",
      event_on: "2026-07-10",
    }),
  ]);
  if (fixtures.some((fixture) => fixture.error))
    throw new Error("Could not create audit pack fixtures.");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
    "base64",
  );
  const localDoc = randomUUID();
  const foreignDoc = randomUUID();
  for (const fixture of [
    { organisation, worker, document: localDoc },
    { ...foreign, document: foreignDoc },
  ]) {
    const upload = await service.storage
      .from(vaultBucket)
      .upload(`${fixture.organisation}/${fixture.document}`, png, {
        contentType: "image/png",
      });
    if (upload.error) throw new Error("Could not seed the audit pack file.");
    const record = await service.from("documents").insert({
      id: fixture.document,
      organisation_id: fixture.organisation,
      sponsored_worker_id: fixture.worker,
      document_type: "other",
      content_type: "image/png",
      size_bytes: png.length,
      scan_status: "not_scanned",
      state: "ready",
      issued_on: "2026-07-01",
      expires_on: "2026-12-01",
    });
    if (record.error)
      throw new Error("Could not seed the audit pack document.");
  }

  await signIn(page, email);
  await enrol(page);
  await expect(page).toHaveURL(`/workspace/${organisation}/dashboard`);
  await page.getByRole("link", { name: "Audit pack", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Checklist items" })
    .fill("Check synthetic reporting dates\nReview document index");
  await page.getByRole("button", { name: "Save checklist" }).click();
  await expect(page.getByText("Checklist saved.")).toBeVisible();
  await page.getByRole("button", { name: "Generate audit pack" }).click();
  await expect(page.getByText("Audit pack queued.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Download ZIP" })).toHaveCount(0);
  const cron = "/api/cron/audit-packs";
  expect((await page.request.get(cron)).status()).toBe(401);
  const generation = await page.request.get(cron, {
    headers: { Authorization: "Bearer synthetic-audit-pack-test-secret" },
  });
  expect(await generation.json()).toEqual({ status: "ready" });
  await page.reload();
  const link = await page
    .getByRole("link", { name: "Download ZIP" })
    .getAttribute("href");
  if (!link) throw new Error("Audit pack download link is missing.");
  const archive = await page.request.get(link);
  expect(archive.ok()).toBe(true);
  const files = unzipSync(await archive.body());
  const pdf = Buffer.from(files["index.pdf"]);
  expect(pdf.toString("latin1")).toMatch(
    /^%PDF-[\s\S]+startxref\s+\d+\s+%%EOF/,
  );
  await writeFile(testInfo.outputPath("synthetic-audit-index.pdf"), pdf);
  expect(Buffer.from(files[`documents/${localDoc}.png`])).toEqual(png);
  expect(files[`documents/${foreignDoc}.png`]).toBeUndefined();
  const index = JSON.parse(Buffer.from(files["records.json"]).toString("utf8"));
  expect(index).toMatchObject({
    name: "Synthetic Audit Pack",
    generated_at: expect.any(String),
    checklist: ["Check synthetic reporting dates", "Review document index"],
    workers: [{ reference: "VAULT-1" }],
    checks: [{ checked_on: "2026-07-01", follow_up_on: "2026-12-01" }],
    reporting: [{ event_on: "2026-07-10", due_on: expect.any(String) }],
    personnel: [{ full_name: "Synthetic Pack Contact" }],
    documents: [{ id: localDoc }],
    ledger: { valid: true },
    disclaimer: expect.stringContaining("does not provide immigration advice"),
  });

  const job = link.split("/").at(-1);
  const otherEmail = fixtureEmail();
  const { data: account, error: accountError } =
    await service.auth.admin.createUser({
      email: otherEmail,
      password,
      email_confirm: true,
    });
  if (accountError || !account.user)
    throw new Error("Could not create the foreign audit pack test manager.");
  const membership = await service.from("memberships").insert({
    organisation_id: foreign.organisation,
    user_id: account.user.id,
    role: "owner",
  });
  if (membership.error)
    throw new Error("Could not create the foreign membership.");
  await page.getByRole("button", { name: "Sign out" }).click();
  await signIn(page, otherEmail);
  await enrol(page);
  await expect(page).toHaveURL(`/workspace/${foreign.organisation}/dashboard`);
  expect((await page.request.get(link, { maxRedirects: 0 })).status()).toBe(
    404,
  );
  expect(
    (
      await page.request.get(
        `/workspace/${foreign.organisation}/audit-pack/download/${job}`,
        { maxRedirects: 0 },
      )
    ).status(),
  ).toBe(404);
});

test("Core shows an upgrade prompt and rejects the twenty-first worker through the API", async ({
  page,
}) => {
  const service = fixtureClient();
  const email = fixtureEmail();
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user)
    throw new Error("Could not create the Core fixture owner.");
  const { data: tenant, error: orgError } = await service
    .from("organisations")
    .insert({ name: "Synthetic Core Fixture" })
    .select("id")
    .single();
  if (orgError) throw new Error("Could not create the Core fixture workspace.");
  const organisation: string = tenant.id;
  await fixturePlan(service, organisation, "core");
  const [member, workers] = await Promise.all([
    service.from("memberships").insert({
      organisation_id: organisation,
      user_id: data.user.id,
      role: "owner",
    }),
    service.from("sponsored_workers").insert(
      Array.from({ length: 20 }, (_, index) => ({
        organisation_id: organisation,
        full_name: `Synthetic Core Worker ${index}`,
        reference: `CORE-${index}`,
        status: "active",
      })),
    ),
  ]);
  if (member.error || workers.error)
    throw new Error("Could not seed the Core fixture.");

  await signIn(page, email);
  await enrol(page);
  await expect(page).toHaveURL(`/workspace/${organisation}/dashboard`);
  await page.getByRole("link", { name: "People", exact: true }).click();
  await expect(page.getByText(/Sponsored worker limit reached/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View the Pro upgrade" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Add record" })).toHaveCount(0);
  await page.goto(`/workspace/${organisation}/workforce`);
  await expect(
    page.getByText("Available on Pro", { exact: true }),
  ).toBeVisible();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key)
    throw new Error("Local Supabase API configuration is missing.");
  const cookies = await page.context().cookies();
  const api = createServerClient(url, key, {
    cookies: { getAll: () => cookies, setAll: () => {} },
  });
  const refused = await api.from("sponsored_workers").insert({
    organisation_id: organisation,
    full_name: "Synthetic Over Limit",
    reference: "CORE-21",
    status: "active",
  });
  expect(refused.error?.code).toBe("P3001");
  const extended = await api.from("engaged_individuals").insert({
    organisation_id: organisation,
    full_name: "Synthetic Core Engagement",
    reference: "CORE-EXT",
    engagement_type: "agency",
  });
  expect(extended.error?.code).toBe("42501");
});

test("invite a client, display partner branding, and revoke access in the same session", async ({
  browser,
  page,
  baseURL,
}) => {
  test.setTimeout(150_000);
  const service = fixtureClient();
  const partnerEmail = fixtureEmail();
  const clientEmail = fixtureEmail();
  const [partnerAccount, clientAccount, tenant, client, unrelated] =
    await Promise.all([
      service.auth.admin.createUser({
        email: partnerEmail,
        password,
        email_confirm: true,
      }),
      service.auth.admin.createUser({
        email: clientEmail,
        password,
        email_confirm: true,
      }),
      service
        .from("organisations")
        .insert({ name: "Synthetic Partner" })
        .select("id")
        .single(),
      vaultFixture(service, "Synthetic Linked Client"),
      vaultFixture(service, "Synthetic Unrelated Client"),
    ]);
  if (
    tenant.error ||
    partnerAccount.error ||
    !partnerAccount.data.user ||
    clientAccount.error ||
    !clientAccount.data.user
  ) {
    throw new Error("Could not create partner test accounts.");
  }
  const partner: string = tenant.data.id;
  const membership = await service.from("memberships").insert([
    {
      organisation_id: partner,
      user_id: partnerAccount.data.user.id,
      role: "owner",
    },
    {
      organisation_id: client.organisation,
      user_id: clientAccount.data.user.id,
      role: "owner",
    },
  ]);
  if (membership.error)
    throw new Error("Could not assign partner test memberships.");

  await signIn(page, partnerEmail);
  await enrol(page);
  await expect(page).toHaveURL(`/workspace/${partner}/dashboard`);
  await page.getByRole("link", { name: "Partners", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Primary colour", exact: true })
    .fill("#123456");
  await page.getByLabel(/Logo \(PNG or JPEG/).setInputFiles({
    name: "synthetic-logo.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await page.getByRole("button", { name: "Save partner branding" }).click();
  await expect(page.getByText("Partner branding saved.")).toBeVisible();
  await page
    .getByRole("textbox", { name: "Client owner’s email address", exact: true })
    .fill(clientEmail);
  await page
    .getByRole("combobox", { name: "Offered access role" })
    .selectOption("hr_user");
  await page.getByRole("button", { name: "Create invitation" }).click();
  const link = await page
    .getByRole("textbox", { name: "Invitation link" })
    .inputValue();
  expect(link).toMatch(/\/partner-invitation#[A-Za-z0-9_-]{43}$/);
  await expect(
    page.getByRole("navigation", { name: "Client switcher" }),
  ).toHaveCount(0);

  const context = await browser.newContext({ baseURL });
  try {
    const owner = await context.newPage();
    await signIn(owner, clientEmail);
    await enrol(owner);
    await expect(owner).toHaveURL(
      `/workspace/${client.organisation}/dashboard`,
    );
    await owner.goto(link);
    await expect(owner.getByText(/requests HR user access/)).toBeVisible();
    await owner
      .getByRole("combobox", { name: "Client organisation" })
      .selectOption(client.organisation);
    await owner.getByRole("button", { name: "Grant partner access" }).click();
    await expect(owner.getByText("Partner access granted.")).toBeVisible();

    await page.reload();
    const switcher = page.getByRole("navigation", { name: "Client switcher" });
    await switcher
      .getByRole("link", { name: "Synthetic Linked Client" })
      .click();
    await expect(page).toHaveURL(`/workspace/${client.organisation}/dashboard`);
    await expect(page.getByText("HR user · Partner access")).toBeVisible();
    await expect(page.locator("aside img")).toBeVisible();
    await expect(page.locator("aside")).toHaveCSS(
      "background-color",
      "rgb(18, 52, 86)",
    );
    await page.getByRole("link", { name: "People", exact: true }).click();
    await expect(page.getByText("Synthetic Vault Worker")).toBeVisible();
    await page.goto(`/workspace/${unrelated.organisation}/people`);
    await expect(page.getByRole("heading", { name: /404/ })).toBeVisible();

    await owner.goto(`/workspace/${client.organisation}/partners`);
    await owner
      .getByRole("button", { name: "Revoke access", exact: true })
      .click();
    await expect(owner.getByText(/Partner · HR user · Revoked/)).toBeVisible();
    await page.goto(`/workspace/${client.organisation}/people`);
    await expect(page.getByRole("heading", { name: /404/ })).toBeVisible();
    await page.goto(`/workspace/${partner}/dashboard`);
    await expect(
      page.getByRole("navigation", { name: "Client switcher" }),
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("export and erase a synthetic worker, remove stored copies and verify the ledger", async ({
  page,
}) => {
  test.skip(
    process.env.SPONSORGUARD_STORAGE_E2E !== "1",
    "Requires local Supabase Storage.",
  );
  test.setTimeout(150_000);
  const service = fixtureClient();
  const email = fixtureEmail();
  const user = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (user.error || !user.data.user)
    throw new Error("Could not create privacy test owner.");
  const { organisation, worker } = await vaultFixture(
    service,
    "Synthetic Privacy Test",
  );
  const membership = await service.from("memberships").insert({
    organisation_id: organisation,
    user_id: user.data.user.id,
    role: "owner",
  });
  const check = await service.from("rtw_checks").insert({
    organisation_id: organisation,
    sponsored_worker_id: worker,
    checked_on: "2026-01-01",
    method: "manual",
  });
  if (membership.error || check.error)
    throw new Error("Could not create privacy fixtures.");
  const document = randomUUID();
  const path = `${organisation}/${document}`;
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
    "base64",
  );
  const upload = await service.storage
    .from(vaultBucket)
    .upload(path, png, { contentType: "image/png" });
  const metadata = await service.from("documents").insert({
    id: document,
    organisation_id: organisation,
    sponsored_worker_id: worker,
    document_type: "identity",
    content_type: "image/png",
    size_bytes: png.length,
    scan_status: "not_scanned",
    state: "ready",
  });
  if (upload.error || metadata.error)
    throw new Error("Could not create privacy document.");

  await signIn(page, email);
  await enrol(page);
  await expect(page).toHaveURL(`/workspace/${organisation}/dashboard`);
  const auth = {
    headers: { Authorization: "Bearer synthetic-audit-pack-test-secret" },
  };
  await page.goto(`/workspace/${organisation}/audit-pack`);
  await page.getByRole("button", { name: "Generate audit pack" }).click();
  await expect(page.getByText("Audit pack queued.")).toBeVisible();
  expect(
    await (await page.request.get("/api/cron/audit-packs", auth)).json(),
  ).toEqual({ status: "ready" });
  await page.reload();
  const pack = await page
    .getByRole("link", { name: "Download ZIP" })
    .getAttribute("href");
  if (!pack) throw new Error("Expected audit pack link.");
  const signedPack = await page.request.get(pack, { maxRedirects: 0 });
  const packUrl = signedPack.headers().location;
  expect(signedPack.status()).toBe(303);

  await page.getByRole("link", { name: "Privacy", exact: true }).click();
  const jsonLink = await page
    .getByRole("link", { name: "Export JSON" })
    .getAttribute("href");
  const pdfLink = await page
    .getByRole("link", { name: "Export PDF" })
    .getAttribute("href");
  if (!jsonLink || !pdfLink) throw new Error("Expected person export links.");
  const exported = await page.request.get(jsonLink);
  expect(exported.headers()["cache-control"]).toBe("private, no-store");
  expect(await exported.json()).toMatchObject({
    person: { full_name: "Synthetic Vault Worker" },
    documents: [{ id: document, content_base64: png.toString("base64") }],
  });
  const pdf = await page.request.get(pdfLink);
  expect((await pdf.body()).toString("latin1")).toContain("/EmbeddedFiles");

  await page.getByRole("link", { name: "Manage retention or erasure" }).click();
  await page
    .getByRole("textbox", { name: "Type ERASE to confirm" })
    .fill("ERASE");
  await page.getByRole("button", { name: "Erase person data" }).click();
  await expect(
    page.getByText("No matching person records on file."),
  ).toBeVisible();
  await expect(
    page.getByText(/Person records erased · Sponsored worker/),
  ).toBeVisible();
  expect((await page.request.get(jsonLink)).status()).toBe(404);
  expect((await page.request.get(pack)).status()).toBe(404);

  const cleanup = await page.request.get("/api/cron/privacy", auth);
  expect(cleanup.ok()).toBe(true);
  expect(await cleanup.json()).toMatchObject({ removed: 2, retry: 0 });
  const removed = await service.storage.from(vaultBucket).download(path);
  expect(removed.error).toBeTruthy();
  const archivePath = decodeURIComponent(
    new URL(packUrl).pathname.split("/sponsorguard-audit-packs/")[1],
  );
  const archive = await service.storage
    .from("sponsorguard-audit-packs")
    .download(archivePath);
  expect(archive.error).toBeTruthy();
  expect((await page.request.get(packUrl)).ok()).toBe(false);

  await page.goto(`/workspace/${organisation}/passport`);
  await expect(page.getByRole("status")).toContainText("4 entries checked");
});

test("review the weekly queue and approve a worker CSV change", async ({
  page,
}) => {
  const service = fixtureClient();
  const email = fixtureEmail();
  const account = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (account.error || !account.data.user)
    throw new Error("Could not create the operations test account.");
  const { organisation, worker } = await vaultFixture(
    service,
    "Synthetic Operations",
  );
  const member = await service.from("memberships").insert({
    organisation_id: organisation,
    user_id: account.data.user.id,
    role: "owner",
  });
  const check = await service.from("rtw_checks").insert({
    organisation_id: organisation,
    sponsored_worker_id: worker,
    checked_on: "2025-01-01",
    follow_up_on: "2025-02-01",
    method: "online",
  });
  if (member.error || check.error)
    throw new Error("Could not prepare the operations test records.");

  await signIn(page, email);
  await enrol(page);
  await expect(page).toHaveURL(`/workspace/${organisation}/dashboard`);
  await expect(
    page.getByRole("region", { name: "Weekly action queue" }),
  ).toContainText("1 action overdue or due within seven days");
  await page.getByRole("link", { name: "View weekly action queue" }).click();
  await page.getByRole("link", { name: "Open action discussion" }).click();
  await page.getByLabel("Assign to").selectOption(account.data.user.id);
  await page.getByRole("button", { name: "Save assignment" }).click();
  await expect(page.getByRole("status")).toContainText("Action updated");
  await page.getByRole("button", { name: "Escalate", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Clear escalation" }),
  ).toBeVisible();
  await page
    .getByLabel("Comment", { exact: true })
    .fill("Synthetic handover note");
  await page.getByRole("button", { name: "Add comment" }).click();
  await expect(
    page.getByText("Synthetic handover note", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Hand back to client" }).click();
  await expect(
    page.getByRole("button", { name: "Acknowledge hand-back" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Change review", exact: true }).click();
  await page.getByLabel("Worker changes CSV").setInputFiles({
    name: "synthetic-work-changes.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Reference,Role,Weekly hours,Work location\nVAULT-1,Analyst,37.50,London",
    ),
  });
  await page.getByRole("button", { name: "Preview changes" }).click();
  await expect(page.getByRole("status")).toContainText(
    "1 worker record to review",
  );
  await page.getByRole("button", { name: "Apply this change" }).click();
  await expect(
    page.getByText("Worker record updated.", { exact: true }),
  ).toBeVisible();
  const saved = await service
    .from("sponsored_workers")
    .select("work_role,work_hours,work_location")
    .eq("id", worker)
    .single();
  expect(saved.data).toEqual({
    work_role: "Analyst",
    work_hours: 37.5,
    work_location: "London",
  });
});
