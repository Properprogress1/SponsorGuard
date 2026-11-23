import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { formatUkDate, londonDate } from "@/lib/dates";

import { topics } from "./preferences";

const topicKeys = Object.keys(topics) as (keyof typeof topics)[];

export type Digest = Record<keyof typeof topics, number> & {
  delivery_id: string;
  email: string;
  unsubscribe_id: string;
};

export function secretsMatch(value: string, expected: string) {
  const a = Buffer.from(value);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function unsubscribeSignature(id: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`notifications-unsubscribe:${id}`)
    .digest("base64url");
}

export function unsubscribeToken(id: string, secret: string) {
  return `${id}.${unsubscribeSignature(id, secret)}`;
}

export function verifyUnsubscribe(token: string, secret: string) {
  const result =
    /^([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/.exec(
      token,
    );
  return result &&
    secretsMatch(result[2], unsubscribeSignature(result[1], secret))
    ? result[1]
    : null;
}

export function digestEmail(
  row: Digest,
  day: string,
  config: { from: string; origin: string; secret: string },
) {
  const unsubscribe = new URL("/notifications/unsubscribe", config.origin);
  unsubscribe.searchParams.set(
    "token",
    unsubscribeToken(row.unsubscribe_id, config.secret),
  );
  const lines = topicKeys
    .filter((key) => row[key] > 0)
    .map((key) => `${topics[key]}: ${row[key]}`);
  return {
    from: config.from,
    to: [row.email],
    subject: `SponsorGuard records digest for ${formatUkDate(day)}`,
    text: [
      "Here are the records flagged across your SponsorGuard workspaces.",
      "",
      ...lines,
      "",
      `Open SponsorGuard: ${new URL("/dashboard", config.origin)}`,
      `Unsubscribe from digest emails: ${unsubscribe}`,
      "",
      "SponsorGuard tracks your records. It does not provide immigration advice or guarantee compliance.",
    ].join("\n"),
    headers: {
      "List-Unsubscribe": `<${unsubscribe}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

type DigestDependencies = {
  now(): Date;
  claim(day: string): Promise<Digest[]>;
  send(rows: Digest[], day: string, key: string): Promise<void>;
  finish(ids: string[], accepted: boolean): Promise<void>;
  pause(): Promise<void>;
};

export async function runDigests({
  now,
  claim,
  send,
  finish,
  pause,
}: DigestDependencies) {
  const day = londonDate(now());
  const result = { accepted: 0, uncertain: 0 };
  for (let batch = 0; batch < 20; batch++) {
    const rows = await claim(day);
    if (!rows.length) break;
    const ids = rows.map((row) => row.delivery_id).sort();
    const key =
      "records-digest/" +
      createHash("sha256").update(ids.join(",")).digest("hex");
    let accepted = true;
    try {
      await send(rows, day, key);
    } catch {
      accepted = false;
    }
    await finish(ids, accepted);
    result[accepted ? "accepted" : "uncertain"] += rows.length;
    if (!accepted) break;
    await pause();
  }
  return result;
}
