import { securityLog } from "@/lib/security/log";
import { auditPackClient } from "@/lib/audit-pack/service";
import { runAuditPack } from "@/lib/audit-pack/worker";
import { secretsMatch } from "@/lib/notifications/digest";

export const maxDuration = 300;

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
  const client = auditPackClient();
  if (!client) return new Response(null, { status: 503 });

  try {
    const status = await runAuditPack(client);
    securityLog({
      event: "scheduled_job",
      job: "audit_packs",
      outcome: status === "failed" ? "failed" : "complete",
    });
    return Response.json(
      { status },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    securityLog({
      event: "scheduled_job",
      job: "audit_packs",
      outcome: "retry",
    });
    return new Response(null, { status: 503 });
  }
}
