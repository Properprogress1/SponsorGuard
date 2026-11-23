"use client";

import { useActionState, useState, type ChangeEvent } from "react";
import { formatUkDate } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { importPeopleRecords, savePeopleRecord } from "@/lib/people/actions";
import { parseCsv, readCsv } from "@/lib/people/csv";
import type { PersonOptions } from "@/lib/people/data";
import {
  categories,
  type CategoryKey,
  type PeopleField,
  type RecordValues,
} from "@/lib/people/records";

const fieldStyle =
  "min-h-11 w-full rounded-md border border-slate-500 bg-white px-3 text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-800";

function Errors({ errors, omitted }: { errors?: string[]; omitted?: number }) {
  if (!errors?.length) return null;
  return (
    <div
      role="alert"
      className="rounded-md border border-red-400 bg-red-50 p-4 text-sm text-red-950"
    >
      <p className="font-semibold">Check the following details</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {errors.map((error, index) => (
          <li key={index}>{error}</li>
        ))}
      </ul>
      {Boolean(omitted) && (
        <p className="mt-2">{omitted} more records have errors.</p>
      )}
    </div>
  );
}

function RecordField({
  field,
  value,
  change,
  options,
}: {
  field: PeopleField;
  value: string;
  change: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  options: PersonOptions;
}) {
  const common = {
    id: field.name,
    name: field.name,
    required: field.required,
    value,
    onChange: change,
    className: fieldStyle,
  };
  const people =
    field.name === "sponsored_worker_id" ||
    field.name === "engaged_individual_id"
      ? options[field.name]
      : [];
  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium" htmlFor={field.name}>
        {field.label}
        {field.required ? "" : " (optional)"}
      </label>
      {field.kind === "choice" ? (
        <select {...common}>
          <option value="">Choose an option</option>
          {Object.entries(field.choices ?? {}).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      ) : field.kind === "person" ? (
        <>
          <input
            {...common}
            list={`${field.name}-people`}
            aria-describedby={`${field.name}-hint`}
            autoComplete="off"
          />
          <datalist id={`${field.name}-people`}>
            {people.map((person) => (
              <option
                key={person.id}
                value={person.id}
                label={`${person.full_name} · ${person.reference}`}
              />
            ))}
          </datalist>
          <p className="text-sm text-slate-700" id={`${field.name}-hint`}>
            Choose a suggestion or paste the record ID from the person’s detail
            page.
          </p>
        </>
      ) : field.kind === "date" ? (
        <>
          <input
            {...common}
            type="text"
            maxLength={10}
            aria-describedby={`${field.name}-hint`}
            autoComplete="off"
          />
          <p id={`${field.name}-hint`} className="text-sm text-slate-700">
            Use DD/MM/YYYY.
          </p>
        </>
      ) : (
        <input
          {...common}
          type="text"
          maxLength={field.maxLength}
          autoComplete="off"
        />
      )}
    </div>
  );
}

export function PeopleRecordForm({
  organisation,
  category,
  id,
  values,
  options,
  fields,
}: {
  organisation: string;
  category: CategoryKey;
  id: string | null;
  values: RecordValues;
  options: PersonOptions;
  fields: readonly PeopleField[];
}) {
  const [state, save, pending] = useActionState(
    savePeopleRecord.bind(null, organisation, category, id),
    {},
  );
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(
      fields.map((field) => {
        const value = values[field.name];
        return [
          field.name,
          value && field.kind === "date" ? formatUkDate(value) : (value ?? ""),
        ];
      }),
    ),
  );
  return (
    <form action={save} className="grid max-w-xl gap-5">
      {category === "rtw" && (
        <p className="text-sm text-slate-700">
          Choose one sponsored worker or one engaged individual.
        </p>
      )}
      {fields.map((field) => (
        <RecordField
          key={field.name}
          field={field}
          options={options}
          value={draft[field.name] ?? ""}
          change={(event) =>
            setDraft({ ...draft, [field.name]: event.target.value })
          }
        />
      ))}
      <Errors errors={state.errors} omitted={state.omitted} />
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Saving…" : "Save record"}
      </Button>
    </form>
  );
}

export function CsvImportForm({
  organisation,
  category,
}: {
  organisation: string;
  category: CategoryKey;
}) {
  const [state, submit, pending] = useActionState(
    importPeopleRecords.bind(null, organisation, category),
    {},
  );
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState("");
  const [reading, setReading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fields: readonly PeopleField[] = categories[category].fields;

  async function readFile() {
    if (!file) return;
    setReading(true);
    setProblem("");
    try {
      const { headers } = parseCsv(await readCsv(file));
      const normalise = (value: string) =>
        value.toLowerCase().replace(/[^a-z0-9]+/g, "_");
      const automatic = fields.flatMap((field) => {
        const column = headers.findIndex((header) =>
          [field.name, normalise(field.label)].includes(normalise(header)),
        );
        return column === -1 ? [] : [[field.name, String(column)]];
      });
      setMapping(Object.fromEntries(automatic));
      setHeaders(headers);
    } catch (error) {
      setProblem(
        error instanceof Error ? error.message : "Could not read the CSV.",
      );
    } finally {
      setReading(false);
    }
  }

  if (state.imported) {
    return (
      <p
        role="status"
        className="rounded-md border border-emerald-400 bg-emerald-50 p-4 font-medium text-emerald-900"
      >
        {state.imported} {state.imported === 1 ? "record" : "records"} imported.
      </p>
    );
  }
  return (
    <form
      action={(data) => {
        if (!file) return;
        setSubmitted(true);
        data.set("csv", file);
        data.set("mapping", JSON.stringify(mapping));
        submit(data);
      }}
      className="grid max-w-xl gap-5"
    >
      <div className="grid gap-2">
        <label className="text-sm font-medium" htmlFor="csv-file">
          CSV file
        </label>
        <input
          id="csv-file"
          type="file"
          accept=".csv,text/csv"
          aria-describedby="csv-hint"
          className="min-h-11 max-w-full rounded-md border border-slate-500 p-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
          disabled={reading || pending}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setHeaders([]);
            setProblem("");
            setSubmitted(false);
          }}
        />
        <p id="csv-hint" className="text-sm text-slate-700">
          Use a UTF-8 file with a header row and up to 500 records (512 KiB).
        </p>
        {file && (
          <p className="break-words text-sm text-slate-700">
            Selected file: {file.name}
          </p>
        )}
      </div>
      {!headers.length && (
        <Button
          type="button"
          className="justify-self-start"
          disabled={!file || reading}
          onClick={readFile}
        >
          {reading ? "Reading columns…" : "Read columns"}
        </Button>
      )}
      {problem && <Errors errors={[problem]} />}
      {headers.length > 0 && (
        <>
          <fieldset className="grid gap-4">
            <legend className="mb-3 font-semibold">Map CSV columns</legend>
            {fields.map((field) => (
              <div key={field.name} className="grid gap-2">
                <label
                  className="text-sm font-medium"
                  htmlFor={`map-${field.name}`}
                >
                  {field.label}
                  {field.required ? "" : " (optional)"}
                </label>
                <select
                  id={`map-${field.name}`}
                  className={fieldStyle}
                  required={field.required}
                  value={mapping[field.name] ?? ""}
                  onChange={(event) =>
                    setMapping({ ...mapping, [field.name]: event.target.value })
                  }
                >
                  <option value="">
                    {field.required ? "Choose a column" : "Skip this field"}
                  </option>
                  {headers.map((header, index) => (
                    <option key={index} value={String(index)}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </fieldset>
          {submitted && !pending && (
            <Errors errors={state.errors} omitted={state.omitted} />
          )}
          <Button
            type="submit"
            disabled={pending}
            className="justify-self-start"
          >
            {pending ? "Validating and importing…" : "Import records"}
          </Button>
        </>
      )}
    </form>
  );
}
