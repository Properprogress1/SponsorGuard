import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  isManager,
  requireWorkspaceSession,
  type Role,
} from "@/lib/auth/access";
import { formatUkDate } from "@/lib/dates";
import { peoplePath } from "@/lib/people/data";
import { listEngagementCategories, listWorkforce } from "@/lib/workforce/data";
import {
  checkStatuses,
  workforceFilters,
  workforceQuery,
  type WorkforceRow,
} from "@/lib/workforce/model";
import { EngagementCategoryForm } from "./category-form";

type SearchParams = Record<string, string | string[] | undefined>;
const field = "min-h-10 rounded-md border border-slate-500 bg-white px-3";
const link = "font-medium underline underline-offset-4";

export async function WorkforceWorkspace({
  organisation,
  role,
  params,
}: {
  organisation: string;
  role: Role;
  params: SearchParams;
}) {
  const { client } = await requireWorkspaceSession();
  const filters = workforceFilters(
    typeof params.category === "string" ? params.category : "",
    typeof params.status === "string" ? params.status : "",
  );
  const requestedPage = Number(params.page);
  const page =
    Number.isInteger(requestedPage) &&
    requestedPage >= 1 &&
    requestedPage <= 10_000
      ? requestedPage
      : 1;
  const pageSize = 50;
  const path = `/workspace/${organisation}/workforce`;
  const [categories, rows] = await Promise.all([
    listEngagementCategories(client, organisation),
    listWorkforce(
      client,
      organisation,
      filters,
      (page - 1) * pageSize,
      pageSize + 1,
    ),
  ]);
  const groups = new Map<string, WorkforceRow[]>();
  for (const row of rows.slice(0, pageSize)) {
    const group = groups.get(row.engagement_type) ?? [];
    group.push(row);
    groups.set(row.engagement_type, group);
  }
  const pageLink = (number: number) => {
    const query = workforceQuery(filters);
    query.set("page", String(number));
    return `${path}?${query}`;
  };

  return (
    <section className="mt-5 grid gap-5">
      <p className="text-sm text-slate-700">
        Shows the latest right-to-work check on file for each engaged individual
        and who is recorded as responsible for checks.
      </p>
      <form
        action={path}
        className="flex flex-wrap items-end gap-3"
        aria-label="Filter workforce"
      >
        <label className="grid gap-1 text-sm font-medium">
          Engagement category
          <select
            name="category"
            defaultValue={filters.category}
            className={field}
          >
            <option value="">All categories</option>
            {categories.map(({ key, label }) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Check status
          <select name="status" defaultValue={filters.status} className={field}>
            <option value="">All statuses</option>
            {Object.entries(checkStatuses).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline">
          Apply filters
        </Button>
        {(filters.category || filters.status) && (
          <Link href={path} className={link}>
            Clear filters
          </Link>
        )}
        <Button variant="outline" asChild>
          <a href={`${path}/export?${workforceQuery(filters)}`}>Export CSV</a>
        </Button>
      </form>
      {groups.size === 0 && (
        <p className="text-sm">
          No engaged individuals on file match these filters.
        </p>
      )}
      {[...groups.values()].map((group) => (
        <section
          key={group[0].engagement_type}
          aria-labelledby={`engagement-${group[0].engagement_type}`}
          className="grid gap-2"
        >
          <h2
            id={`engagement-${group[0].engagement_type}`}
            className="text-lg font-semibold"
          >
            {group[0].engagement_label}
          </h2>
          <div className="overflow-x-auto rounded-md border bg-white">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                {group[0].engagement_label} right-to-work records
              </caption>
              <thead className="bg-slate-100">
                <tr>
                  {[
                    "Name",
                    "Reference",
                    "Recorded responsibility for checks",
                    "Check status",
                    "Latest check",
                    "Follow-up date",
                  ].map((heading) => (
                    <th key={heading} scope="col" className="p-3">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {group.map((row) => (
                  <tr key={row.id}>
                    <th scope="row" className="p-3">
                      <Link
                        href={peoplePath(organisation, "individuals", {
                          record: row.id,
                        })}
                        className={link}
                      >
                        {row.full_name}
                      </Link>
                    </th>
                    <td className="p-3">{row.reference}</td>
                    <td className="p-3">
                      {row.check_responsibility ?? "Not recorded"}
                    </td>
                    <td className="p-3">{checkStatuses[row.check_status]}</td>
                    <td className="p-3">
                      {row.checked_on ? formatUkDate(row.checked_on) : "—"}
                    </td>
                    <td className="p-3">
                      {row.follow_up_on ? formatUkDate(row.follow_up_on) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {(page > 1 || rows.length > pageSize) && (
        <nav aria-label="Workforce pages" className="flex gap-4 text-sm">
          {page > 1 && (
            <Link className={link} href={pageLink(page - 1)}>
              Previous page
            </Link>
          )}
          {rows.length > pageSize && page < 10_000 && (
            <Link className={link} href={pageLink(page + 1)}>
              Next page
            </Link>
          )}
        </nav>
      )}
      {isManager(role) && (
        <details className="rounded-md border bg-white p-4">
          <summary className="cursor-pointer font-semibold">
            Manage engagement categories
          </summary>
          <div className="mt-4 grid gap-4">
            <EngagementCategoryForm organisation={organisation} />
            {categories.map((category) => (
              <details key={category.key} className="border-t pt-2">
                <summary className="mb-2 cursor-pointer text-sm">
                  Edit {category.label} ({category.key})
                </summary>
                <EngagementCategoryForm
                  organisation={organisation}
                  category={category}
                />
              </details>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
