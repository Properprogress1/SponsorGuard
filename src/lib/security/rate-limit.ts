import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { authConfig } from "@/lib/auth/config";
import { securityLog, type RateOperation } from "./log";

export function trustedNetwork(incoming: Pick<Headers, "get">) {
  const header =
    process.env.VERCEL === "1"
      ? "x-vercel-forwarded-for"
      : process.env.RATE_LIMIT_TRUST_PROXY === "1"
        ? "x-forwarded-for"
        : null;
  const raw = header ? incoming.get(header)?.trim() : undefined;
  return raw && isIP(raw) ? raw.toLowerCase() : "shared";
}

export function rateKey(
  secret: string,
  operation: RateOperation,
  scope: "network" | "subject",
  value: string,
) {
  return createHmac("sha256", secret)
    .update(`${operation}\0${scope}\0${value}`)
    .digest("hex");
}

function rateService() {
  const config = authConfig();
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return config && secret
    ? createClient(config.url, secret, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;
}

export async function allowSecurityRequest(
  operation: RateOperation,
  subject?: string,
) {
  const secret = process.env.APP_RATE_LIMIT_SECRET;
  const service = rateService();
  if (!secret || Buffer.byteLength(secret) < 32 || !service) {
    securityLog({ event: "rate_limit", operation, outcome: "unavailable" });
    return false;
  }
  const network = trustedNetwork(await headers());
  const { data, error } = await service
    .rpc("consume_security_rate", {
      operation,
      network_key: rateKey(secret, operation, "network", network),
      subject_key: subject
        ? rateKey(secret, operation, "subject", subject)
        : null,
    })
    .abortSignal(AbortSignal.timeout(5_000));
  if (data !== true)
    securityLog({
      event: "rate_limit",
      operation,
      outcome: error ? "unavailable" : "blocked",
    });
  return data === true;
}
