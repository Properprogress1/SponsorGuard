import { expect, it } from "vitest";
import {
  parseQueueFilter,
  parseQueuePage,
  queueDates,
  queueHref,
} from "./queue-filters";

it("uses London dates across the clock change", () => {
  expect(queueDates(new Date("2026-03-28T23:30:00Z"))).toEqual({
    today: "2026-03-28",
    through: "2026-04-04",
  });
  expect(queueDates(new Date("2026-03-29T23:30:00Z"))).toEqual({
    today: "2026-03-30",
    through: "2026-04-06",
  });
});

it("normalises invalid inputs and preserves the list when opening a discussion", () => {
  expect(parseQueueFilter("constructor")).toBe("all");
  expect(parseQueueFilter(["mine"])).toBe("all");
  expect(parseQueueFilter("mine")).toBe("mine");
  expect(parseQueuePage("0")).toBe(1);
  expect(parseQueuePage("2")).toBe(2);
  expect(queueHref("tenant", "mine", 2, "rtw:check")).toBe(
    "/workspace/tenant/actions?filter=mine&page=2&item=rtw%3Acheck#action-detail",
  );
});
