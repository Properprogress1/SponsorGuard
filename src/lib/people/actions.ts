"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { importCsv, readCsv } from "./csv";
import { requireRecordEditor } from "@/lib/auth/access";
import { listEngagementCategories } from "@/lib/workforce/data";
import { peoplePath, validatePeopleLinks } from "./data";
import {
  categories,
  isCategory,
  isRecordId,
  validateRecord,
  type CategoryKey,
} from "./records";

type FormState = { errors?: string[]; omitted?: number; imported?: number };

function errorState(errors: string[]): FormState {
  return {
    errors: errors.slice(0, 25),
    omitted: Math.max(errors.length - 25, 0),
  };
}

async function engagementChoices(
  client: Awaited<ReturnType<typeof requireRecordEditor>>,
  organisation: string,
  category: CategoryKey,
) {
  if (category !== "individuals") return undefined;
  const options = await listEngagementCategories(client, organisation);
  return Object.fromEntries(options.map(({ key, label }) => [key, label]));
}

export async function savePeopleRecord(
  organisation: string,
  category: CategoryKey,
  id: string | null,
  _: FormState,
  form: FormData,
): Promise<FormState> {
  if (!isCategory(category) || (id && !isRecordId(id))) notFound();
  const client = await requireRecordEditor(organisation);
  let choices: Record<string, string> | undefined;
  try {
    choices = await engagementChoices(client, organisation, category);
  } catch {
    return errorState(["Could not load engagement categories. Try again."]);
  }
  const { values, errors } = validateRecord(
    category,
    (name) => {
      const value = form.get(name);
      return typeof value === "string" ? value : "";
    },
    choices,
  );
  if (errors.length) return errorState(errors);
  try {
    const [links] = await validatePeopleLinks(client, organisation, [values]);
    if (links.length) return errorState(links);
  } catch {
    return errorState(["Could not validate the record. Try again."]);
  }

  const table = client.from(categories[category].table);
  const query = id
    ? table.update(values).eq("organisation_id", organisation).eq("id", id)
    : table.insert({ ...values, organisation_id: organisation });
  const { data, error } = await query
    .select("id")
    .maybeSingle<{ id: string }>();
  if (error?.code === "P3001")
    return errorState([
      "Sponsored worker limit reached. View plan options in Billing.",
    ]);
  if (error?.code === "23505")
    return errorState(["Reference is already on file."]);
  if (error || !data)
    return errorState([
      "Could not save the record. Check the details and try again.",
    ]);
  revalidatePath(`/workspace/${organisation}/people`);
  if (category === "individuals" || category === "rtw")
    revalidatePath(`/workspace/${organisation}/workforce`);
  redirect(peoplePath(organisation, category, { record: data.id, saved: "1" }));
}

export async function importPeopleRecords(
  organisation: string,
  category: CategoryKey,
  _: FormState,
  form: FormData,
): Promise<FormState> {
  if (!isCategory(category)) notFound();
  const client = await requireRecordEditor(organisation);
  const file = form.get("csv");
  if (!(file instanceof File)) return errorState(["Choose a CSV file."]);
  let text: string;
  let mapping: unknown;
  try {
    text = await readCsv(file);
    mapping = JSON.parse(String(form.get("mapping")));
  } catch (error) {
    return errorState([
      error instanceof SyntaxError
        ? "Map the CSV columns before importing."
        : error instanceof Error
          ? error.message
          : "Could not read the CSV file.",
    ]);
  }

  try {
    const choices = await engagementChoices(client, organisation, category);
    const outcome = await importCsv(
      category,
      text,
      mapping,
      async (rows) => {
        try {
          const linked = await validatePeopleLinks(client, organisation, rows);
          const linkErrors = linked.flatMap((errors, index) =>
            errors.length
              ? [`CSV record ${index + 2}. ${errors.join(" ")}`]
              : [],
          );
          if (linkErrors.length) return errorState(linkErrors);
          const { error } = await client
            .from(categories[category].table)
            .insert(
              rows.map((values) => ({
                ...values,
                organisation_id: organisation,
              })),
            );
          if (
            error &&
            ["23505", "23503", "23514", "42501"].includes(error.code)
          )
            return errorState([
              "The batch was rejected. Check for duplicate references or changed linked records. No records were imported.",
            ]);
          if (error) throw new Error("Batch result unavailable.");
          return { imported: rows.length };
        } catch {
          return errorState([
            "Could not complete the import. Check the records on file before retrying.",
          ]);
        }
      },
      choices,
    );
    if ("errors" in outcome && outcome.errors)
      return errorState(outcome.errors);
    if (outcome.result?.imported) {
      revalidatePath(`/workspace/${organisation}/people`);
      if (category === "individuals" || category === "rtw")
        revalidatePath(`/workspace/${organisation}/workforce`);
    }
    return outcome.result ?? errorState(["Could not complete the import."]);
  } catch (error) {
    return errorState([
      error instanceof Error ? error.message : "Could not validate the CSV.",
    ]);
  }
}
