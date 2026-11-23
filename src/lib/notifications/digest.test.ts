import { afterEach, expect, it, vi } from "vitest";
import {
  digestEmail,
  runDigests,
  unsubscribeToken,
  verifyUnsubscribe,
  type Digest,
} from "./digest";

const recipient: Digest = {
  delivery_id: "delivery",
  unsubscribe_id: "00000000-0000-4000-8000-000000010201",
  email: "synthetic@example.com",
  tasks: 2,
  documents: 0,
  rtw: 0,
  personnel: 0,
};

afterEach(() => vi.useRealTimers());

function harness() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-01T23:10:00Z"));
  const claimedDays = new Set<string>();
  return {
    now: () => new Date(),
    claim: vi.fn(async (day: string) => {
      if (claimedDays.has(day)) return [];
      claimedDays.add(day);
      return [recipient];
    }),
    send: vi
      .fn<(...args: [Digest[], string, string]) => Promise<void>>()
      .mockResolvedValue(undefined),
    finish: vi
      .fn<(ids: string[], accepted: boolean) => Promise<void>>()
      .mockResolvedValue(undefined),
    pause: async () => {},
  };
}

it("uses London dates and sends once even when scheduled runs overlap", async () => {
  const deps = harness();
  await Promise.all([runDigests(deps), runDigests(deps)]);
  expect(deps.send).toHaveBeenCalledTimes(1);
  expect(deps.send).toHaveBeenCalledWith(
    [recipient],
    "2026-07-02",
    expect.stringMatching(/^records-digest\/[a-f0-9]{64}$/),
  );
  vi.setSystemTime(new Date("2026-07-02T23:10:00Z"));
  await runDigests(deps);
  expect(deps.send).toHaveBeenCalledTimes(2);
  expect(deps.send).toHaveBeenLastCalledWith(
    [recipient],
    "2026-07-03",
    expect.any(String),
  );
});

it("does not send again when a provider acknowledgement is lost", async () => {
  const deps = harness();
  deps.send.mockRejectedValueOnce(new Error("Connection lost"));
  expect(await runDigests(deps)).toEqual({ accepted: 0, uncertain: 1 });
  expect(deps.finish).toHaveBeenCalledWith(["delivery"], false);
  await runDigests(deps);
  expect(deps.send).toHaveBeenCalledTimes(1);
});

it("includes only selected populated topics and provides a signed one-click unsubscribe", () => {
  const config = {
    from: "sender@example.com",
    origin: "https://example.com",
    secret: "test-secret",
  };
  const email = digestEmail(recipient, "2026-07-02", config);
  expect(email.text).toContain("Open reporting and handover tasks: 2");
  expect(email.text).not.toContain("Document expiry");
  const token = unsubscribeToken(recipient.unsubscribe_id, config.secret);
  expect(email.headers["List-Unsubscribe"]).toContain(token);
  expect(email.headers["List-Unsubscribe-Post"]).toBe(
    "List-Unsubscribe=One-Click",
  );
  expect(verifyUnsubscribe(token, config.secret)).toBe(
    recipient.unsubscribe_id,
  );
  expect(verifyUnsubscribe(token, "wrong-secret")).toBeNull();
  expect(
    verifyUnsubscribe(token.replace("010201", "010202"), config.secret),
  ).toBeNull();
});

it("keeps the durable claim if the worker stops after asking Resend to send", async () => {
  const deps = harness();
  deps.finish.mockRejectedValueOnce(new Error("Database connection lost"));
  await expect(runDigests(deps)).rejects.toThrow("Database connection lost");
  await runDigests(deps);
  expect(deps.send).toHaveBeenCalledTimes(1);
});
