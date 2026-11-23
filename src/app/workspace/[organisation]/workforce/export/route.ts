import {
  workspaceMemberships,
  requireWorkspaceSession,
} from "@/lib/auth/access";
import { isRecordId } from "@/lib/people/records";
import { listWorkforce } from "@/lib/workforce/data";
import {
  workforceCsv,
  workforceFilters,
  type WorkforceRow,
} from "@/lib/workforce/model";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ organisation: string }> },
) {
  const { organisation } = await params;
  const { client } = await requireWorkspaceSession();
  if (
    !isRecordId(organisation) ||
    !(await workspaceMemberships()).some(
      (row) => row.organisation_id === organisation,
    )
  ) {
    return new Response("Not found", { status: 404 });
  }

  const search = new URL(request.url).searchParams;
  const filters = workforceFilters(
    search.get("category") ?? "",
    search.get("status") ?? "",
  );
  const rows: WorkforceRow[] = [];
  const size = 500;
  for (let offset = 0; ; offset += size) {
    const batch = await listWorkforce(
      client,
      organisation,
      filters,
      offset,
      size,
    );
    rows.push(...batch);
    if (batch.length < size) break;
  }
  return new Response(workforceCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="workforce-map.csv"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
