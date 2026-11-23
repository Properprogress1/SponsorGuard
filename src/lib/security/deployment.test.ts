// @vitest-environment node

import { existsSync } from "node:fs";
import { expect, it } from "vitest";
import config from "../../../vercel.json";

it("uses London Fluid compute and schedules each cron handler once a day in UTC", () => {
  expect(config.fluid).toBe(true);
  expect(config.regions).toEqual(["lhr1"]);
  expect(config.crons).toEqual([
    { path: "/api/cron/notifications", schedule: "0 8 * * *" },
    { path: "/api/cron/audit-packs", schedule: "0 9 * * *" },
    { path: "/api/cron/privacy", schedule: "0 10 * * *" },
  ]);
  for (const { path } of config.crons) {
    expect(existsSync(`src/app${path}/route.ts`)).toBe(true);
  }
});
