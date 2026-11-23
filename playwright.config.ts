import { defineConfig, devices } from "@playwright/test";

const chromium = {
  ...devices["Desktop Chrome"],
  channel: process.env.PLAYWRIGHT_USE_CHROME === "1" ? "chrome" : undefined,
};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", testIgnore: "**/auth.spec.ts", use: chromium },
    {
      name: "auth",
      testMatch: "**/auth.spec.ts",
      outputDir: "auth-test-results",
      timeout: 90_000,
      use: { ...chromium, trace: "off", screenshot: "off", video: "off" },
    },
  ],
  webServer: {
    command: "npm run build && npm run start -- --hostname 127.0.0.1",
    url: "http://127.0.0.1:3000/api/health",
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      SPONSORGUARD_LOCAL_HTTP: "1",
      APP_RATE_LIMIT_SECRET: "local-playwright-synthetic-rate-limit-key",
      CRON_SECRET: "synthetic-audit-pack-test-secret",
    },
  },
});
