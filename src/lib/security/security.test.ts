// @vitest-environment node

import { afterEach, expect, it, vi } from "vitest";
import { pageCsp } from "./headers";
import { securityLog } from "./log";
import { rateKey, trustedNetwork } from "./rate-limit";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("accepts only an explicitly trusted single address", () => {
  vi.stubEnv("VERCEL", "0");
  vi.stubEnv("RATE_LIMIT_TRUST_PROXY", "0");
  const incoming = new Headers({
    "x-forwarded-for": "192.0.2.1",
    "x-vercel-forwarded-for": "192.0.2.2",
  });
  expect(trustedNetwork(incoming)).toBe("shared");
  vi.stubEnv("RATE_LIMIT_TRUST_PROXY", "1");
  expect(trustedNetwork(incoming)).toBe("192.0.2.1");
  incoming.set("x-forwarded-for", "192.0.2.1, 192.0.2.2");
  expect(trustedNetwork(incoming)).toBe("shared");
  vi.stubEnv("VERCEL", "1");
  expect(trustedNetwork(incoming)).toBe("192.0.2.2");
});

it("uses separate HMAC domains for operations and budget types", () => {
  const key = (
    operation: "auth_sign_in" | "auth_sign_up",
    scope: "network" | "subject",
  ) =>
    rateKey(
      "synthetic fixture secret",
      operation,
      scope,
      "synthetic@example.test",
    );
  expect(key("auth_sign_in", "subject")).toMatch(/^[a-f0-9]{64}$/);
  expect(key("auth_sign_in", "subject")).toBe(key("auth_sign_in", "subject"));
  expect(
    new Set([
      key("auth_sign_in", "subject"),
      key("auth_sign_in", "network"),
      key("auth_sign_up", "subject"),
    ]).size,
  ).toBe(3);
});

it("allows only the configured fields in structured security logs", () => {
  const timestamp = "2026-11-23T12:00:00.000Z";
  vi.useFakeTimers();
  vi.setSystemTime(new Date(timestamp));
  const output = vi.spyOn(console, "info").mockImplementation(() => {});
  const entry = {
    event: "rate_limit",
    operation: "auth_sign_in",
    outcome: "blocked",
    email: "synthetic@example.test",
    token: "synthetic-token",
    ip: "192.0.2.4",
  } as const;
  securityLog(entry);
  expect(output).toHaveBeenCalledOnce();
  expect(output).toHaveBeenCalledWith(
    JSON.stringify({
      timestamp,
      event: entry.event,
      outcome: entry.outcome,
      operation: entry.operation,
    }),
  );
});

it("adds eval only for development and always blocks framing", () => {
  expect(pageCsp("synthetic", false)).not.toContain("'unsafe-eval'");
  expect(pageCsp("synthetic", true)).toContain("'unsafe-eval'");
  expect(pageCsp("synthetic", false)).toContain("frame-ancestors 'none'");
});
