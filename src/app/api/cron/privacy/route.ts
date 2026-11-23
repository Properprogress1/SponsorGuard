import { securityLog } from "@/lib/security/log";
import { londonDate } from "@/lib/dates";
import { secretsMatch } from "@/lib/notifications/digest";
import { privacyService } from "@/lib/privacy/service";

export const maxDuration = 120;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (
    !secret ||
    !secretsMatch(
      request.headers.get("authorization") ?? "",
      `Bearer ${secret}`,
    )
  )
    return new Response(null, { status: 401 });
  const service = privacyService();
  if (!service) return new Response(null, { status: 503 });

  const limiter = await service.rpc("purge_security_rate_buckets");
  const erased = await service.rpc("purge_privacy_due", {
    run_on: londonDate(),
  });
  const evidence = await service.rpc("recover_interrupted_evidence");
  const cleanup = await service.rpc("claim_privacy_storage");
  if (cleanup.error) {
    securityLog({ event: "scheduled_job", job: "privacy", outcome: "retry" });
    return new Response(null, { status: 503 });
  }
  let removed = 0;
  let retry = 0;
  for (const item of cleanup.data) {
    const result = await service.storage.from(item.bucket).remove([item.path]);
    if (result.error) {
      retry++;
      continue;
    }
    const settled = await service.rpc("finish_privacy_storage", {
      target_bucket: item.bucket,
      target_path: item.path,
      claim: item.lease,
    });
    if (settled.error) retry++;
    else removed++;
  }
  const incomplete = erased.error || retry || limiter.error || evidence.error;
  securityLog({
    event: "scheduled_job",
    job: "privacy",
    outcome: incomplete ? "retry" : "complete",
  });
  return Response.json(
    { erased: erased.data, removed, retry },
    {
      status: incomplete ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
