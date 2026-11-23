import { expect, it } from "vitest";
import { prepareCsv } from "@/lib/people/csv";
import { workforceCsv, workforceFilters, workforceQuery } from "./model";

it("validates and preserves supported category and status filters", () => {
  expect(
    workforceQuery(workforceFilters("custom-type", "due")).toString(),
  ).toBe("category=custom-type&status=due");
  expect(
    workforceQuery(workforceFilters("invalid,category", "invalid")).toString(),
  ).toBe("");
});

it("exports factual status, UK dates and quoted spreadsheet-safe text", () => {
  const csv = workforceCsv([
    {
      id: "1",
      full_name: 'Synthetic "Person"',
      reference: "=1+1",
      engagement_type: "custom",
      engagement_label: "Custom, category",
      check_responsibility: " +123",
      check_status: "due",
      checked_on: "2026-11-21",
      follow_up_on: "2026-11-22",
    },
  ]);
  expect(csv).toContain(
    '"Synthetic ""Person""","\'=1+1","Custom, category","\' +123","Follow-up due","21/11/2026","22/11/2026"\r\n',
  );
});

it("accepts configured category identifiers and optional responsibility in People imports", () => {
  const result = prepareCsv(
    "individuals",
    "Name,Reference,Category,Responsibility\nSynthetic,A1,custom-type,Operations",
    {
      full_name: "0",
      reference: "1",
      engagement_type: "2",
      check_responsibility: "3",
    },
    { "custom-type": "Custom label" },
  );
  expect(result.errors).toEqual([]);
  expect(result.values[0]).toMatchObject({
    engagement_type: "custom-type",
    check_responsibility: "Operations",
  });
});
