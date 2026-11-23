import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import Home from "./page";

it("describes the sponsor records product and links to the free health check", () => {
  render(<Home />);
  expect(
    screen.getByRole("heading", {
      name: "Keep your sponsor records in order.",
      level: 1,
    }),
  ).toBeVisible();
  expect(
    screen.getByRole("link", { name: "Start free health check" }),
  ).toHaveAttribute("href", "/health-check");
  expect(
    screen.getByRole("heading", { name: "The Compliance Passport" }),
  ).toBeVisible();
});
