import Link from "next/link";
import { requireWorkspaceSession } from "@/lib/auth/access";
import { formatUkDate } from "@/lib/dates";
import { londonTime, scopes, type ShareScope } from "@/lib/passport/model";
import { getPersonOptions } from "@/lib/people/data";
import { RevokeShare, ShareForm } from "./manage";

type Share = {
  id: string;
  scope: ShareScope;
  from_day: string | null;
  through_day: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
};
type Access = {
  id: number;
  share_id: string;
  accessed_at: string;
  outcome: "opened" | "incorrect_passcode" | "rate_limited";
};
const accessLabels = {
  opened: "Opened",
  incorrect_passcode: "Incorrect passcode",
  rate_limited: "Passcode limit reached",
};

export async function PassportShares({
  organisation,
  page,
}: {
  organisation: string;
  page: string | string[] | undefined;
}) {
  const now = new Date();
  const requestedPage =
    typeof page === "string" && /^\d{1,7}$/.test(page) ? Number(page) : 1;
  const currentPage = Math.max(1, requestedPage);
  const pageSize = 25;
  const offset = (currentPage - 1) * pageSize;
  const pageLink = (target: number) => `?shares=${target}#share-links`;
  const { client } = await requireWorkspaceSession();
  const [links, activity, people] = await Promise.all([
    client
      .from("passport_shares")
      .select(
        "id, scope, from_day, through_day, expires_at, revoked_at, created_at",
      )
      .eq("organisation_id", organisation)
      .order("created_at", { ascending: false })
      .order("id")
      .range(offset, offset + pageSize)
      .returns<Share[]>(),
    client
      .from("passport_share_access")
      .select("id, share_id, accessed_at, outcome")
      .eq("organisation_id", organisation)
      .order("accessed_at", { ascending: false })
      .limit(20)
      .returns<Access[]>(),
    getPersonOptions(
      client,
      organisation,
      ["sponsored_worker_id", "engaged_individual_id"],
      undefined,
      true,
    ),
  ]);

  if (links.error || activity.error) {
    return (
      <p role="alert" className="mt-6 text-sm text-red-900">
        Could not load Passport sharing. Reload to try again.
      </p>
    );
  }

  return (
    <div className="mt-6 grid gap-6">
      <section
        aria-labelledby="share-create"
        className="grid gap-4 rounded-lg border bg-white p-5"
      >
        <h2 id="share-create" className="text-lg font-semibold">
          Share the Passport
        </h2>
        <ShareForm organisation={organisation} people={people} />
      </section>
      <section aria-labelledby="share-links" className="grid gap-3">
        <h2 id="share-links" className="text-lg font-semibold">
          Share links
        </h2>
        {links.data.length ? (
          <ul className="divide-y rounded-md border bg-white">
            {links.data.slice(0, pageSize).map((link) => {
              const status = link.revoked_at
                ? "Revoked"
                : Date.parse(link.expires_at) <= now.getTime()
                  ? "Expired"
                  : "Active";
              return (
                <li
                  key={link.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-4"
                >
                  <div className="grid gap-1 text-sm">
                    <p className="font-semibold">
                      {scopes[link.scope]} · {status}
                    </p>
                    {link.from_day && link.through_day && (
                      <p>
                        {formatUkDate(link.from_day)} to{" "}
                        {formatUkDate(link.through_day)}
                      </p>
                    )}
                    <p>
                      Created {londonTime(link.created_at)} · Expires{" "}
                      {londonTime(link.expires_at)}
                    </p>
                    <p className="font-mono text-xs">
                      Reference {link.id.slice(0, 8)}
                    </p>
                  </div>
                  {status === "Active" && (
                    <RevokeShare organisation={organisation} id={link.id} />
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm">No share links on this page.</p>
        )}
        {(currentPage > 1 || links.data.length > pageSize) && (
          <nav aria-label="Share link pages" className="flex gap-4 text-sm">
            {currentPage > 1 && (
              <Link className="underline" href={pageLink(currentPage - 1)}>
                Newer links
              </Link>
            )}
            {links.data.length > pageSize && (
              <Link className="underline" href={pageLink(currentPage + 1)}>
                Older links
              </Link>
            )}
          </nav>
        )}
      </section>
      <section aria-labelledby="share-activity" className="grid gap-3">
        <h2 id="share-activity" className="text-lg font-semibold">
          Latest share activity
        </h2>
        {activity.data.length ? (
          <ul className="divide-y rounded-md border bg-white">
            {activity.data.map((entry) => (
              <li key={entry.id} className="p-3 text-sm">
                {accessLabels[entry.outcome]} · {londonTime(entry.accessed_at)}{" "}
                · Reference {entry.share_id.slice(0, 8)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">No share activity on file.</p>
        )}
      </section>
    </div>
  );
}
