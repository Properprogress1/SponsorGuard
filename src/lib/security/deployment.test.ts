// @vitest-environment node

import { existsSync } from "node:fs";
import { expect, it } from "vitest";
import config from "../../../vercel.json";

it("pins production compute to London and schedules the existing cron handlers in UTC", () => {
  expect(config.regions).toEqual(["lhr1"]);
  expect(config.crons).toEqual([
    { path: "/api/cron/notifications", schedule: "0 8 * * *" },
    { path: "/api/cron/audit-packs", schedule: "*/5 * * * *" },
    { path: "/api/cron/privacy", schedule: "5 * * * *" },
  ]);
  for (const { path } of config.crons) {
    expect(existsSync(`src/app${path}/route.ts`)).toBe(true);
  }
});
