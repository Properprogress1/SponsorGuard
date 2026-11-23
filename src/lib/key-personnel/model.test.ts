import { describe, expect, it } from "vitest";
import { personnelAlerts, type Person } from "./model";

const person: Person = {
  id: "fixture",
  full_name: "Synthetic Person",
  role: "Key Contact",
  sms_mfa: "unknown",
  sms_last_login_on: "2026-03-29",
  leaving: false,
};

describe("key personnel alerts", () => {
  it("flags the threshold boundary using calendar dates across the UK clock change", () => {
    expect(personnelAlerts([person], "2026-04-01", 4).inactive).toEqual([]);
    expect(personnelAlerts([person], "2026-04-01", 3).inactive).toEqual([
      person,
    ]);
    expect(personnelAlerts([person], "2026-04-01", null).inactive).toEqual([]);
  });
  it("treats leaving personnel as unavailable and reports missing login dates separately", () => {
    const pending = {
      ...person,
      role: "Authorising Officer",
      sms_last_login_on: null,
    };
    const alerts = personnelAlerts(
      [{ ...person, leaving: true }, pending],
      "2026-04-01",
      3,
    );
    expect(alerts.unfilled).toEqual(["Key Contact", "Level 1 user"]);
    expect(alerts.inactive).toEqual([]);
    expect(alerts.missingLogin).toEqual([pending]);
  });
});
