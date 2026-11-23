import { securityLog } from "@/lib/security/log";
import { setTimeout as delay } from "node:timers/promises";
import {
  digestEmail,
  runDigests,
  secretsMatch,
} from "@/lib/notifications/digest";
import { notificationClient } from "@/lib/notifications/service";

export const maxDuration = 60;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (
    !cronSecret ||
    !secretsMatch(
      request.headers.get("authorization") ?? "",
      `Bearer ${cronSecret}`,
    )
  ) {
    return new Response(null, { status: 401 });
  }

  const client = notificationClient();
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const secret = process.env.NOTIFICATION_UNSUBSCRIBE_SECRET;
  const origin = process.env.NOTIFICATION_APP_ORIGIN;
  if (!client || !key || !from || !secret || !origin)
    return new Response(null, { status: 503 });

  try {
    const base = new URL(origin);
    if (
      base.protocol !== "https:" &&
      !(base.protocol === "http:" && base.hostname === "localhost")
    )
      return new Response(null, { status: 503 });
    const result = await runDigests({
      now: () => new Date(),
      async claim(day) {
        const { data, error } = await client.rpc("claim_notification_digests", {
          run_on: day,
          batch_size: 100,
        });
        if (error) throw new Error("Could not claim digests.");
        return data;
      },
      async send(rows, day, idempotencyKey) {
        const response = await fetch("https://api.resend.com/emails/batch", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(
            rows.map((row) =>
              digestEmail(row, day, { from, origin: base.origin, secret }),
            ),
          ),
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error("Digest dispatch was not confirmed.");
      },
      async finish(ids, accepted) {
        const { error } = await client.rpc("finish_notification_digests", {
          delivery_ids: ids,
          accepted,
        });
        if (error) throw new Error("Could not record digest outcome.");
      },
      pause: () => delay(600),
    });
    securityLog({
      event: "scheduled_job",
      job: "notifications",
      outcome: result.uncertain ? "retry" : "complete",
    });
    return Response.json(result, {
      status: result.uncertain ? 502 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    securityLog({
      event: "scheduled_job",
      job: "notifications",
      outcome: "retry",
    });
    return new Response(null, { status: 502 });
  }
}
