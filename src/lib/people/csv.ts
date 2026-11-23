import { CsvError, parse } from "csv-parse/browser/esm/sync";
import {
  categories,
  validateRecord,
  type CategoryKey,
  type RecordValues,
  type PeopleField,
} from "./records";

export const maxCsvBytes = 512 * 1024;
const maxRows = 500;

export async function readCsv(file: File) {
  if (!file.size || file.size > maxCsvBytes)
    throw new Error("Choose a non-empty CSV file no larger than 512 KiB.");
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Save the CSV file in UTF-8 and try again.");
  }
}

export function parseCsv(text: string): {
  headers: string[];
  rows: string[][];
} {
  if (text.includes("\0"))
    throw new Error("The CSV contains invalid null characters.");
  let records: string[][];
  try {
    records = parse(text, {
      bom: true,
      skip_empty_lines: true,
      max_record_size: 65_536,
      to: maxRows + 2,
    });
  } catch (error) {
    const line =
      error instanceof CsvError && typeof error.lines === "number"
        ? ` near line ${error.lines}`
        : "";
    throw new Error(
      `Malformed CSV${line}. Check quotation marks and the number of columns.`,
    );
  }
  const [header, ...rows] = records;
  if (!header || !rows.length)
    throw new Error("Include a header and at least one data row.");
  if (rows.length > maxRows)
    throw new Error("Import up to 500 data rows at a time.");
  const headers = header.map((value) => value.trim());
  if (
    headers.length > 100 ||
    headers.some((value) => !value || value.length > 120) ||
    new Set(headers.map((value) => value.toLowerCase())).size !== headers.length
  ) {
    throw new Error(
      "Use up to 100 distinct, non-empty column names of at most 120 characters.",
    );
  }
  return { headers, rows };
}

export function prepareCsv(
  category: CategoryKey,
  text: string,
  mapping: unknown,
  engagementChoices?: Record<string, string>,
) {
  const { headers, rows } = parseCsv(text);
  const fields: readonly PeopleField[] = categories[category].fields;
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping))
    throw new Error("Map the CSV columns before importing.");
  const submitted = mapping as Record<string, unknown>;
  const positions = new Map<string, number>();
  for (const field of fields) {
    const value = Object.hasOwn(submitted, field.name)
      ? submitted[field.name]
      : "";
    if (value === "" && !field.required) continue;
    if (
      typeof value !== "string" ||
      !/^\d{1,3}$/.test(value) ||
      Number(value) >= headers.length
    ) {
      throw new Error(`Choose a CSV column for ${field.label}.`);
    }
    positions.set(field.name, Number(value));
  }
  if (new Set(positions.values()).size !== positions.size)
    throw new Error("Map each CSV column to at most one field.");

  const references = new Set<string>();
  const errors: string[] = [];
  const values = rows.map((row, index) => {
    const result = validateRecord(
      category,
      (name) => row[positions.get(name) ?? -1] ?? "",
      engagementChoices,
    );
    if (result.values.reference) {
      if (references.has(result.values.reference))
        result.errors.push("Reference appears more than once in this file.");
      references.add(result.values.reference);
    }
    if (result.errors.length)
      errors.push(`CSV record ${index + 2}. ${result.errors.join(" ")}`);
    return result.values;
  });
  return { values, errors };
}

export async function importCsv<T>(
  category: CategoryKey,
  text: string,
  mapping: unknown,
  writeBatch: (rows: RecordValues[]) => Promise<T>,
  engagementChoices?: Record<string, string>,
) {
  const { values, errors } = prepareCsv(
    category,
    text,
    mapping,
    engagementChoices,
  );
  if (errors.length) return { errors };
  const result = await writeBatch(values);
  return { result };
}
