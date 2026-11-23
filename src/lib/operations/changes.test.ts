import { expect, it } from "vitest";
import { changedFields, parseWorkChanges } from "./changes";

const header = "Reference,Role,Weekly hours,Work location\n";
it("normalises decimal hours and reports precise differences", () => {
  const [row] = parseWorkChanges(header + "SW-1,Analyst,37.50,London");
  expect(row.work_hours).toBe(37.5);
  expect(
    changedFields({ ...row, work_hours: 40, work_role: "Assistant" }, row),
  ).toEqual(["work_role", "work_hours"]);
});
it("rejects duplicate and malformed rows before producing a review", () => {
  expect(() =>
    parseWorkChanges(header + "SW-1,Analyst,40,London\nSW-1,Analyst,40,Leeds"),
  ).toThrow("Record 3");
  expect(() => parseWorkChanges(header + "SW-2,Analyst,169,London")).toThrow(
    "0–168",
  );
  expect(() => parseWorkChanges(header + "SW-3,Analyst,,London")).toThrow(
    "Record 2",
  );
});
