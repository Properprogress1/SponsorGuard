import { expect, test } from "@playwright/test";

test("the landing page links to the public health check and pricing", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Records for UK sponsor licence holders/);
  await expect(
    page.getByRole("heading", { name: "Keep your sponsor records in order." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "View pricing" }).click();
  await expect(page.getByText("£990 billed annually")).toBeVisible();
  await expect(page.getByText("£1,990 billed annually")).toBeVisible();
  await page.getByRole("link", { name: "Start free health check" }).click();
  await expect(
    page.getByRole("heading", { name: "Free licence health check" }),
  ).toBeVisible();
});

test("health endpoint exposes an uncached JSON liveness response", async ({
  request,
}) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/json");
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(await response.json()).toEqual({ status: "ok" });
});
