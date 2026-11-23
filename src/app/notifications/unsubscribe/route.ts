import { verifyUnsubscribe } from "@/lib/notifications/digest";
import { notificationClient } from "@/lib/notifications/service";

const headers = {
  "Cache-Control": "no-store",
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy":
    "default-src 'none'; form-action 'self'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

function tokenFrom(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const secret = process.env.NOTIFICATION_UNSUBSCRIBE_SECRET;
  return { token, id: secret ? verifyUnsubscribe(token, secret) : null };
}

function page(content: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SponsorGuard email preferences</title></head><body><main><h1>SponsorGuard email preferences</h1>${content}</main></body></html>`,
    { status, headers },
  );
}

export function GET(request: Request) {
  const { token, id } = tokenFrom(request);
  if (!id) return page("<p>This unsubscribe link is unavailable.</p>", 400);
  return page(
    `<form method="post" action="?token=${token}"><button type="submit">Unsubscribe from digest emails</button></form>`,
  );
}

export async function POST(request: Request) {
  const { id } = tokenFrom(request);
  if (!id) return page("<p>This unsubscribe link is unavailable.</p>", 400);
  const client = notificationClient();
  if (!client)
    return page("<p>Could not unsubscribe. Try again later.</p>", 503);
  const { error } = await client.rpc("unsubscribe_notification_digests", {
    opaque_id: id,
  });
  if (error) return page("<p>Could not unsubscribe. Try again later.</p>", 503);
  return page(
    "<p>Digest emails are turned off. You can turn them on again in SponsorGuard.</p>",
  );
}
