import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const publicPages = [
  "/",
  "/pricing",
  "/health-check",
  "/terms",
  "/privacy",
  "/dpa",
];
test.describe.configure({ timeout: 60_000 });

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

for (const route of publicPages) {
  test(`${route} passes automated accessibility checks`, async ({ page }) => {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const report = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
    expect(
      report.violations,
      JSON.stringify(
        report.violations.map(({ id, nodes }) => ({
          id,
          targets: nodes.map((node) => node.target),
        })),
      ),
    ).toEqual([]);
  });
}

test("the health check stays in page memory and gives no compliance result", async ({
  page,
  context,
}) => {
  await page.goto("/health-check");
  await expect(
    page
      .getByText(
        "SponsorGuard tracks your records. It does not provide immigration advice or guarantee compliance.",
      )
      .first(),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to main content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();

  const writes: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method())) writes.push(request.url());
  });
  const boxes = page.getByRole("checkbox");
  await expect(boxes).toHaveCount(5);
  for (const box of await boxes.all()) await box.check();
  await expect(
    page.locator("main input:not([type=checkbox]), main textarea"),
  ).toHaveCount(0);
  await expect(page.getByRole("main")).not.toContainText(
    /\b(?:you are compliant|licence is compliant|compliance score|readiness score|passed|failed|100%)\b/i,
  );
  expect(
    await page.evaluate(() => [localStorage.length, sessionStorage.length]),
  ).toEqual([0, 0]);
  expect(await context.cookies()).toEqual([]);
  expect(writes).toEqual([]);

  await page.getByRole("button", { name: "Clear selections" }).click();
  await expect(page.getByRole("status")).toHaveText("Selections cleared.");
  await expect(page.locator("main input:checked")).toHaveCount(0);
  await boxes.first().check();
  await page.reload();
  await expect(page.locator("main input:checked")).toHaveCount(0);
});

test("the public pages have canonical metadata and a public-only sitemap", async ({
  page,
  request,
}) => {
  await page.goto("/pricing");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/pricing$/,
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    /Pricing/,
  );
  await page.goto("/privacy");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  const xml = await sitemap.text();
  expect(xml).toContain("/pricing</loc>");
  expect(xml).toContain("/health-check</loc>");
  expect(xml).not.toMatch(
    /\/workspace|\/privacy<\/loc>|\/terms<\/loc>|\/dpa<\/loc>/,
  );
  const robots = await request.get("/robots.txt");
  expect(await robots.text()).toContain("Disallow: /workspace/");
});

test("production pages send fresh CSP nonces and sensitive pages prevent caching", async ({
  page,
}) => {
  const first = await page.goto("/health-check");
  const headers = first?.headers();
  expect(headers?.["x-content-type-options"]).toBe("nosniff");
  expect(headers?.["x-frame-options"]).toBe("DENY");
  expect(headers?.["referrer-policy"]).toBe("no-referrer");
  expect(headers?.["x-powered-by"]).toBeUndefined();
  const scriptPolicy =
    headers?.["content-security-policy"]?.match(/script-src ([^;]+)/)?.[1];
  const nonce = scriptPolicy?.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce).toBeTruthy();
  expect(scriptPolicy).toContain("'strict-dynamic'");
  expect(scriptPolicy).not.toMatch(/unsafe-inline|unsafe-eval/);
  const inlineNonces = await page
    .locator("script:not([src])")
    .evaluateAll((scripts) =>
      scripts.map((script) =>
        script instanceof HTMLScriptElement ? script.nonce : "",
      ),
    );
  expect(inlineNonces.length).toBeGreaterThan(0);
  expect(new Set(inlineNonces)).toEqual(new Set([nonce]));

  const second = await page.reload();
  const secondPolicy = second?.headers()["content-security-policy"];
  expect(secondPolicy).toContain("'nonce-");
  expect(secondPolicy).not.toContain(`'nonce-${nonce}'`);
  const share = await page.goto("/share");
  expect(share?.headers()["cache-control"]).toContain("no-store");
});
