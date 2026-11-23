import { requireWorkspaceSession } from "@/lib/auth/access";
import {
  defaultChecklist,
  packFailures,
  type PackFailure,
} from "@/lib/audit-pack/model";
import { londonTime } from "@/lib/passport/model";
import { ChecklistForm, QueueAuditPack } from "./forms";

type Job = {
  id: string;
  status: "queued" | "running" | "ready" | "failed";
  requested_at: string;
  generated_at: string | null;
  failure: PackFailure | null;
};
const labels = {
  queued: "Queued",
  running: "Generating",
  ready: "Ready to download",
  failed: "Failed",
};

export async function AuditPackWorkspace({
  organisation,
}: {
  organisation: string;
}) {
  const { client } = await requireWorkspaceSession();
  const [settings, jobs] = await Promise.all([
    client
      .from("audit_pack_settings")
      .select("checklist")
      .eq("organisation_id", organisation)
      .maybeSingle<{ checklist: string[] }>(),
    client
      .from("audit_pack_jobs")
      .select("id, status, requested_at, generated_at, failure")
      .eq("organisation_id", organisation)
      .order("requested_at", { ascending: false })
      .limit(20)
      .returns<Job[]>(),
  ]);
  if (settings.error || jobs.error)
    return (
      <p role="alert" className="mt-5">
        Could not load audit packs.
      </p>
    );

  return (
    <div className="mt-5 grid gap-6">
      <p className="max-w-2xl text-sm text-slate-700">
        The pack is generated in the background. It contains the PDF index, a
        record index and copies of documents on file.
      </p>
      <QueueAuditPack
        organisation={organisation}
        running={jobs.data.some(
          (job) => job.status === "queued" || job.status === "running",
        )}
      />
      <section
        aria-labelledby="pack-checklist"
        className="grid gap-3 rounded-md border bg-white p-4"
      >
        <h2 id="pack-checklist" className="text-lg font-semibold">
          Organisation checklist
        </h2>
        <ChecklistForm
          organisation={organisation}
          initial={settings.data?.checklist ?? defaultChecklist}
        />
      </section>
      <section aria-labelledby="pack-history" className="grid gap-3">
        <h2 id="pack-history" className="text-lg font-semibold">
          Recent audit packs
        </h2>
        {jobs.data.length ? (
          <ul
            className="divide-y rounded-md border bg-white"
            aria-live="polite"
          >
            {jobs.data.map((job) => (
              <li key={job.id} className="grid gap-1 p-4 text-sm">
                <p className="font-medium">{labels[job.status]}</p>
                <p>Requested {londonTime(job.requested_at)}</p>
                {job.generated_at && (
                  <p>Generated {londonTime(job.generated_at)}</p>
                )}
                {job.failure && <p>{packFailures[job.failure]}</p>}
                {job.status === "ready" && (
                  <a
                    className="w-fit font-medium underline underline-offset-4"
                    href={`/workspace/${organisation}/audit-pack/download/${job.id}`}
                  >
                    Download ZIP
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">No audit packs on file.</p>
        )}
      </section>
    </div>
  );
}
