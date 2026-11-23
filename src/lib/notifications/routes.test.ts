// @vitest-environment node

import { afterEach, expect, it, vi } from "vitest";
import { GET as dispatch } from "@/app/api/cron/notifications/route";
import {
  GET as preview,
  POST as unsubscribe,
} from "@/app/notifications/unsubscribe/route";
import { unsubscribeToken } from "./digest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("./service", () => ({ notificationClient: () => ({ rpc }) }));
vi.mock("node:timers/promises", () => {
  const setTimeout = async () => {};
  return { default: { setTimeout }, setTimeout };
});

const opaqueId = "00000000-0000-4000-8000-000000010201";
const testSecret = "test-secret";

afterEach(() => {
  rpc.mockReset();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("authenticates the scheduler and calls Resend once for a claimed batch", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-01T23:10:00Z"));
  vi.stubEnv("CRON_SECRET", testSecret);
  vi.stubEnv("RESEND_API_KEY", "test-resend");
  vi.stubEnv("RESEND_FROM_EMAIL", "sender@example.com");
  vi.stubEnv("NOTIFICATION_UNSUBSCRIBE_SECRET", testSecret);
  vi.stubEnv("NOTIFICATION_APP_ORIGIN", "https://example.com");
  rpc
    .mockResolvedValueOnce({
      data: [
        {
          delivery_id: "delivery",
          unsubscribe_id: opaqueId,
          email: "synthetic@example.com",
          tasks: 0,
          documents: 1,
          rtw: 0,
          personnel: 0,
        },
      ],
    })
    .mockResolvedValueOnce({})
    .mockResolvedValue({ data: [] });
  const fetch = vi.fn(async () =>
    Response.json({ data: [{ id: "fake-resend-id" }] }),
  );
  vi.stubGlobal("fetch", fetch);

  const url = "https://example.com/api/cron/notifications";
  expect((await dispatch(new Request(url))).status).toBe(401);
  expect(rpc).not.toHaveBeenCalled();
  const request = new Request(url, {
    headers: { Authorization: `Bearer ${testSecret}` },
  });
  expect(await (await dispatch(request)).json()).toEqual({
    accepted: 1,
    uncertain: 0,
  });
  expect(await (await dispatch(request)).json()).toEqual({
    accepted: 0,
    uncertain: 0,
  });
  expect(rpc).toHaveBeenCalledWith("claim_notification_digests", {
    run_on: "2026-07-02",
    batch_size: 100,
  });
  expect(rpc).toHaveBeenCalledWith("finish_notification_digests", {
    delivery_ids: ["delivery"],
    accepted: true,
  });
  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    "https://api.resend.com/emails/batch",
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        "Idempotency-Key": expect.stringMatching(/^records-digest\//),
      }),
      body: expect.stringContaining("Document expiry reminders: 1"),
    }),
  );
});

it("requires a valid signed POST and leaves preferences alone on preview", async () => {
  vi.stubEnv("NOTIFICATION_UNSUBSCRIBE_SECRET", testSecret);
  const url = "https://example.com/notifications/unsubscribe?token=";
  const token = unsubscribeToken(opaqueId, testSecret);
  expect(preview(new Request(url + token)).status).toBe(200);
  expect(
    (await unsubscribe(new Request(url + "invalid", { method: "POST" })))
      .status,
  ).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
  rpc.mockResolvedValue({});
  const response = await unsubscribe(
    new Request(url + token, {
      method: "POST",
      body: "List-Unsubscribe=One-Click",
    }),
  );
  expect(response.status).toBe(200);
  expect(rpc).toHaveBeenCalledExactlyOnceWith(
    "unsubscribe_notification_digests",
    { opaque_id: opaqueId },
  );
});
