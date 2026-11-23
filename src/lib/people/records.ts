import { parseUkDate } from "@/lib/dates";

type Field = {
  name: string;
  label: string;
  kind: "text" | "date" | "choice" | "person";
  required?: boolean;
  maxLength?: number;
  choices?: Record<string, string>;
};

const workerStatus = { active: "Active", inactive: "Inactive" };
const engagementTypes = {
  employee: "Employee",
  contractor: "Contractor",
  subcontractor: "Subcontractor",
  agency: "Agency",
  platform: "Platform",
};
const cosStatus = {
  assigned: "Assigned",
  used: "Used",
  withdrawn: "Withdrawn",
};
const checkMethods = { online: "Online", manual: "Manual", other: "Other" };

const nameField = {
  name: "full_name",
  label: "Full name",
  kind: "text",
  required: true,
  maxLength: 120,
} as const;
const referenceField = {
  name: "reference",
  label: "Reference",
  kind: "text",
  required: true,
  maxLength: 80,
} as const;
const workerField = {
  name: "sponsored_worker_id",
  label: "Sponsored worker",
  kind: "person",
} as const;
const individualField = {
  name: "engaged_individual_id",
  label: "Engaged individual",
  kind: "person",
} as const;

type Category = {
  title: string;
  singular: string;
  table: string;
  filter: Field;
  fields: readonly Field[];
};

const workerFilter = {
  name: "status",
  label: "Status",
  kind: "choice",
  choices: workerStatus,
  required: true,
} as const;
const engagementFilter = {
  name: "engagement_type",
  label: "Engagement type",
  kind: "choice",
  choices: engagementTypes,
  required: true,
} as const;
const cosFilter = {
  name: "status",
  label: "Status",
  kind: "choice",
  choices: cosStatus,
  required: true,
} as const;
const methodFilter = {
  name: "method",
  label: "Check method",
  kind: "choice",
  choices: checkMethods,
  required: true,
} as const;

export const categories = {
  workers: {
    title: "Sponsored workers",
    singular: "sponsored worker",
    table: "sponsored_workers",
    filter: workerFilter,
    fields: [nameField, referenceField, workerFilter],
  },
  individuals: {
    title: "Engaged individuals",
    singular: "engaged individual",
    table: "engaged_individuals",
    filter: engagementFilter,
    fields: [
      nameField,
      referenceField,
      engagementFilter,
      {
        name: "check_responsibility",
        label: "Recorded responsibility for checks",
        kind: "text",
        maxLength: 120,
      },
    ],
  },
  cos: {
    title: "CoS records",
    singular: "CoS record",
    table: "cos_records",
    filter: cosFilter,
    fields: [
      referenceField,
      { ...workerField, required: true },
      {
        name: "assigned_on",
        label: "Assigned date",
        kind: "date",
        required: true,
      },
      cosFilter,
    ],
  },
  rtw: {
    title: "Right to work checks",
    singular: "right to work check",
    table: "rtw_checks",
    filter: methodFilter,
    fields: [
      workerField,
      individualField,
      { name: "checked_on", label: "Check date", kind: "date", required: true },
      methodFilter,
      { name: "follow_up_on", label: "Follow-up date", kind: "date" },
    ],
  },
} satisfies Record<string, Category>;

export type CategoryKey = keyof typeof categories;
export type RecordValues = Record<string, string | null>;
export type PeopleRecord = RecordValues & { id: string };
export type PeopleField = Field;

export function isCategory(value: unknown): value is CategoryKey {
  return typeof value === "string" && Object.hasOwn(categories, value);
}

export function isRecordId(value: string) {
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

export function peopleCategory(
  category: CategoryKey,
  engagementChoices?: Record<string, string>,
): Category {
  const config: Category = categories[category];
  if (category !== "individuals" || !engagementChoices) return config;
  const filter = { ...engagementFilter, choices: engagementChoices };
  return {
    ...config,
    filter,
    fields: config.fields.map((field) =>
      field.name === filter.name ? filter : field,
    ),
  };
}

export function validateRecord(
  category: CategoryKey,
  read: (name: string) => string,
  engagementChoices?: Record<string, string>,
) {
  const values: RecordValues = {};
  const errors: string[] = [];
  for (const field of peopleCategory(category, engagementChoices).fields) {
    const value = read(field.name).trim();
    if (!value) {
      if (field.required) errors.push(`${field.label} is required.`);
      values[field.name] = null;
      continue;
    }
    switch (field.kind) {
      case "choice": {
        const normalised = value.toLowerCase();
        if (!field.choices || !Object.hasOwn(field.choices, normalised))
          errors.push(`${field.label} must be one of the listed options.`);
        values[field.name] = normalised;
        break;
      }
      case "date": {
        values[field.name] = parseUkDate(value);
        if (!values[field.name])
          errors.push(
            `${field.label} must be a real date in DD/MM/YYYY or YYYY-MM-DD format.`,
          );
        break;
      }
      case "person":
        if (!isRecordId(value))
          errors.push(`${field.label} must be a record ID (UUID).`);
        values[field.name] = value.toLowerCase();
        break;
      case "text":
        if (
          value.length > (field.maxLength ?? 120) ||
          /[\p{Cc}]/u.test(value)
        ) {
          errors.push(
            `${field.label} must be on one line and use at most ${field.maxLength ?? 120} characters.`,
          );
        }
        values[field.name] = value;
        break;
    }
  }
  if (category === "rtw") {
    if (
      Boolean(values.sponsored_worker_id) ===
      Boolean(values.engaged_individual_id)
    ) {
      errors.push("Choose exactly one sponsored worker or engaged individual.");
    }
    if (
      values.follow_up_on &&
      values.checked_on &&
      values.follow_up_on < values.checked_on
    ) {
      errors.push("Follow-up date cannot be before the check date.");
    }
  }
  return { values, errors };
}
