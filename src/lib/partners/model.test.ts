import { expect, it } from "vitest";
import { brandInk, isBrandColour, isPartnerRole } from "./model";

it("validates accessible theme inputs and picks a contrasting text colour", () => {
  expect(isBrandColour("#123456")).toBe(true);
  expect(isBrandColour("#FFF")).toBe(false);
  expect(isBrandColour("url(bad)")).toBe(false);
  expect(brandInk("#000000")).toBe("#ffffff");
  expect(brandInk("#ffffff")).toBe("#000000");
  expect(brandInk("#777777")).toBe("#000000");
});

it("excludes ownership from consented roles", () => {
  expect(isPartnerRole("admin")).toBe(true);
  expect(isPartnerRole("hr_user")).toBe(true);
  expect(isPartnerRole("viewer")).toBe(true);
  expect(isPartnerRole("owner")).toBe(false);
});
