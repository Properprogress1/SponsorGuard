import { notFound } from "next/navigation";
import { requireWorkspaceSession } from "@/lib/auth/access";
import {
  categories,
  type CategoryKey,
  type PeopleRecord,
  type RecordValues,
} from "./records";

type Client = Awaited<ReturnType<typeof requireWorkspaceSession>>["client"];
type PersonOption = { id: string; full_name: string; reference: string };
export type PersonOptions = Record<
  "sponsored_worker_id" | "engaged_individual_id",
  PersonOption[]
>;

export function peoplePath(
  organisation: string,
  category: CategoryKey,
  search: Record<string, string> = {},
) {
  return `/workspace/${organisation}/people?${new URLSearchParams({ category, ...search })}`;
}

export async function listPeopleRecords(
  client: Client,
  organisation: string,
  category: CategoryKey,
  filters: { choice: string; followUp: string; today: string; page: number },
) {
  const config = categories[category];
  const size = 25;
  const offset = (filters.page - 1) * size;
  const order =
    category === "rtw"
      ? "checked_on"
      : category === "cos"
        ? "assigned_on"
        : "full_name";
  let query = client
    .from(config.table)
    .select("*", { count: "exact" })
    .eq("organisation_id", organisation);
  if (filters.choice) query = query.eq(config.filter.name, filters.choice);
  if (category === "rtw") {
    if (filters.followUp === "due")
      query = query.lte("follow_up_on", filters.today);
    if (filters.followUp === "scheduled")
      query = query.gt("follow_up_on", filters.today);
    if (filters.followUp === "none") query = query.is("follow_up_on", null);
  }
  const { data, count, error } = await query
    .order(order, { ascending: order === "full_name" })
    .order("id")
    .range(offset, offset + size - 1)
    .returns<PeopleRecord[]>();
  if (error && error.code !== "PGRST103")
    throw new Error("Could not load people records.");
  return { rows: data ?? [], count: count ?? 0, size };
}

export async function getPeopleRecord(
  client: Client,
  organisation: string,
  category: CategoryKey,
  id: string,
) {
  const { data, error } = await client
    .from(categories[category].table)
    .select("*")
    .eq("organisation_id", organisation)
    .eq("id", id)
    .maybeSingle<PeopleRecord>();
  if (error) throw new Error("Could not load the record.");
  if (!data) notFound();
  return data;
}

const personFields = [
  {
    column: "sponsored_worker_id",
    table: "sponsored_workers",
    label: "Sponsored worker",
  },
  {
    column: "engaged_individual_id",
    table: "engaged_individuals",
    label: "Engaged individual",
  },
] as const;

export async function getPersonOptions(
  client: Client,
  organisation: string,
  columns: readonly string[],
  rows?: RecordValues[],
  includeAll = false,
): Promise<PersonOptions> {
  const options: PersonOptions = {
    sponsored_worker_id: [],
    engaged_individual_id: [],
  };
  await Promise.all(
    personFields.map(async (field) => {
      if (!columns.includes(field.column)) return;
      const ids = rows
        ? [...new Set(rows.flatMap((row) => row[field.column] ?? []))]
        : undefined;
      if (ids?.length === 0) return;

      const pageSize = 100;
      for (let offset = 0; ; offset += pageSize) {
        let query = client
          .from(field.table)
          .select("id, full_name, reference")
          .eq("organisation_id", organisation);
        if (ids) query = query.in("id", ids);
        const { data, error } = await query
          .order("full_name")
          .order("id")
          .range(offset, offset + pageSize - 1)
          .returns<PersonOption[]>();
        if (error) throw new Error("Could not load linked people.");
        options[field.column].push(...data);
        if (!includeAll || ids || data.length < pageSize) return;
      }
    }),
  );
  return options;
}

export async function validatePeopleLinks(
  client: Client,
  organisation: string,
  rows: RecordValues[],
) {
  const errors = rows.map((): string[] => []);
  await Promise.all(
    personFields.map(async (field) => {
      const ids = [...new Set(rows.flatMap((row) => row[field.column] ?? []))];
      const found = new Set<string>();
      // Limit URL size when validating large imports.
      for (let start = 0; start < ids.length; start += 40) {
        const { data, error } = await client
          .from(field.table)
          .select("id")
          .eq("organisation_id", organisation)
          .in("id", ids.slice(start, start + 40))
          .returns<{ id: string }[]>();
        if (error) throw new Error("Could not validate linked records.");
        for (const row of data) found.add(row.id);
      }
      rows.forEach((row, index) => {
        const id = row[field.column];
        if (id && !found.has(id))
          errors[index].push(
            `${field.label} was not found in this organisation.`,
          );
      });
    }),
  );
  return errors;
}
