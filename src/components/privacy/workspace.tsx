import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspaceSession } from "@/lib/auth/access";
import { formatUkDate } from "@/lib/dates";
import { londonTime } from "@/lib/passport/model";
import { isRecordId } from "@/lib/people/records";
import {
  isPersonKind,
  personKinds,
  privacyActions,
  type PersonKind,
  type PrivacyAction,
} from "@/lib/privacy/model";
import { PersonPrivacyControls, RetentionRuleForm } from "./forms";

type Person = {
  kind: PersonKind;
  id: string;
  full_name: string;
  started_on: string | null;
  held: boolean;
};
type Log = {
  action: PrivacyAction;
  kind: PersonKind | null;
  occurred_at: string;
};
type Rule = {
  kind: PersonKind;
  effective_from: string;
  retention_days: number | null;
  source_reference: string;
};
type Search = Record<string, string | string[] | undefined>;
const linkStyle = "font-medium underline underline-offset-4";

export async function PrivacyWorkspace({
  organisation,
  owner,
  params,
}: {
  organisation: string;
  owner: boolean;
  params: Search;
}) {
  const { client } = await requireWorkspaceSession();
  const path = `/workspace/${organisation}/privacy`;
  const id = typeof params.person === "string" ? params.person : "";
  const kind = typeof params.kind === "string" ? params.kind : "";
  if (id && (!isRecordId(id) || !isPersonKind(kind))) notFound();
  const requested = Number(params.page);
  const page =
    Number.isSafeInteger(requested) && requested >= 1 && requested <= 10000
      ? requested
      : 1;
  const size = 25;
  let query = client.rpc("privacy_people", { tenant: organisation });
  if (id) query = query.eq("id", id).eq("kind", kind);
  else
    query = query
      .order("full_name")
      .order("kind")
      .order("id")
      .range((page - 1) * size, page * size);
  const [people, history, settings, pending] = await Promise.all([
    query,
    client.rpc("privacy_recent_access", { tenant: organisation }),
    client
      .from("privacy_retention_rules")
      .select("kind, effective_from, retention_days, source_reference")
      .eq("organisation_id", organisation)
      .order("effective_from", { ascending: false })
      .limit(30)
      .returns<Rule[]>(),
    client.rpc("privacy_pending_storage", { tenant: organisation }),
  ]);
  if (
    (people.error && people.error.code !== "PGRST103") ||
    history.error ||
    !Array.isArray(history.data) ||
    settings.error ||
    pending.error
  ) {
    return (
      <p role="alert" className="mt-5">
        Could not load privacy records.
      </p>
    );
  }
  const rows = (Array.isArray(people.data) ? people.data : []) as Person[];
  const logs = history.data as Log[];
  return (
    <div className="mt-5 grid gap-6">
      {Boolean(pending.data) && (
        <p role="status" className="rounded-md border bg-white p-3 text-sm">
          {String(pending.data)} file removals pending.
        </p>
      )}
      <section aria-labelledby="privacy-people" className="grid gap-3">
        <h2 id="privacy-people" className="text-lg font-semibold">
          Person records
        </h2>
        {id && (
          <Link href={path} className={linkStyle}>
            Back to all people
          </Link>
        )}
        {rows.length === 0 ? (
          <p className="text-sm">No matching person records on file.</p>
        ) : (
          <ul className="divide-y rounded-md border bg-white">
            {rows.slice(0, size).map((person) => (
              <li
                key={`${person.kind}-${person.id}`}
                className="grid gap-3 p-4 text-sm"
              >
                <div>
                  <h3 className="font-semibold">{person.full_name}</h3>
                  <p>
                    {personKinds[person.kind]}
                    {person.held ? " · Erasure on hold" : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-4">
                  {(["json", "pdf"] as const).map((format) => (
                    <a
                      key={format}
                      href={`${path}/export/${person.kind}/${person.id}?format=${format}`}
                      className={linkStyle}
                    >
                      Export {format.toUpperCase()}
                    </a>
                  ))}
                  {!id && owner && (
                    <Link
                      href={`${path}?kind=${person.kind}&person=${person.id}`}
                      className={linkStyle}
                    >
                      Manage retention or erasure
                    </Link>
                  )}
                </div>
                {id && owner && (
                  <PersonPrivacyControls
                    organisation={organisation}
                    person={person}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        {!id && (page > 1 || rows.length > size) && (
          <nav aria-label="Person record pages" className="flex gap-4 text-sm">
            {page > 1 && (
              <Link href={`${path}?page=${page - 1}`} className={linkStyle}>
                Previous page
              </Link>
            )}
            {rows.length > size && (
              <Link href={`${path}?page=${page + 1}`} className={linkStyle}>
                Next page
              </Link>
            )}
          </nav>
        )}
      </section>
      <section
        aria-labelledby="privacy-rules"
        className="grid gap-3 rounded-md border bg-white p-4"
      >
        <h2 id="privacy-rules" className="text-lg font-semibold">
          Retention configuration
        </h2>
        <p className="text-sm">
          Automatic purging requires an effective rule and a recorded start
          date. A hold prevents erasure.
        </p>
        {settings.data.length ? (
          <ul className="divide-y">
            {settings.data.map((rule) => (
              <li
                key={`${rule.kind}-${rule.effective_from}`}
                className="py-2 text-sm"
              >
                {personKinds[rule.kind]} · Effective{" "}
                {formatUkDate(rule.effective_from)} ·{" "}
                {rule.retention_days === null
                  ? "Purging paused"
                  : `${rule.retention_days} days`}{" "}
                · {rule.source_reference}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">No retention rules on file.</p>
        )}
        {owner && <RetentionRuleForm organisation={organisation} />}
      </section>
      <section aria-labelledby="privacy-access" className="grid gap-3">
        <h2 id="privacy-access" className="text-lg font-semibold">
          Recent access and privacy activity
        </h2>
        <p className="text-sm">
          Shows export requests, signed links issued through SponsorGuard,
          Passport access activity and changes to retention or person records.
        </p>
        {logs.length ? (
          <ul className="divide-y rounded-md border bg-white">
            {logs.map((entry, index) => (
              <li key={`${entry.occurred_at}-${index}`} className="p-3 text-sm">
                {privacyActions[entry.action]}
                {entry.kind ? ` · ${personKinds[entry.kind]}` : ""} ·{" "}
                {londonTime(entry.occurred_at)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">No privacy activity on file.</p>
        )}
      </section>
    </div>
  );
}
