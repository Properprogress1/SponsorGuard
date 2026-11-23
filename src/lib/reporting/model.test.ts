import { describe, expect, it } from "vitest";
import { londonDate } from "@/lib/dates";
import {
  deadlineState,
  dueSoonThrough,
  rulesForDate,
  type ReportingRule,
} from "./model";

const first: ReportingRule = {
  key: "clock",
  description: "Synthetic clock",
  version: 1,
  working_day_limit: 2,
  source_reference: "Synthetic test source",
  effective_from: "2026-01-01",
  effective_to: null,
  requires_verification: true,
};
const second: ReportingRule = {
  ...first,
  version: 2,
  effective_from: "2026-06-01",
  effective_to: "2026-08-01",
};

describe("reporting UI states", () => {
  it("treats today and the next three days as due soon across a year boundary", () => {
    const today = "2026-12-30";
    expect(dueSoonThrough(today)).toBe("2027-01-02");
    expect(deadlineState("2026-12-29", false, today)).toBe("overdue");
    expect(deadlineState(today, false, today)).toBe("soon");
    expect(deadlineState("2027-01-02", false, today)).toBe("soon");
    expect(deadlineState("2027-01-03", false, today)).toBe("upcoming");
    expect(deadlineState("2026-12-29", true, today)).toBe("completed");
  });

  it("uses the London calendar even when the current UTC date differs", () => {
    const today = londonDate(new Date("2026-07-01T23:15:00Z"));
    expect(today).toBe("2026-07-02");
    expect(deadlineState("2026-07-01", false, today)).toBe("overdue");
  });

  it("matches effective starts, exclusive ends and same-date version precedence", () => {
    expect(rulesForDate([second, first], "2026-05-31")).toEqual([first]);
    expect(rulesForDate([first, second], "2026-06-01")).toEqual([second]);
    expect(rulesForDate([first, second], "2026-08-01")).toEqual([]);
    const corrected = { ...second, version: 3 };
    expect(rulesForDate([corrected, second, first], "2026-06-01")).toEqual([
      corrected,
    ]);
  });
});
