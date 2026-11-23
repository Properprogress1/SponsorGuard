import { parseCsv } from "@/lib/people/csv";

export type WorkDetails = {
  work_role: string | null;
  work_hours: number | null;
  work_location: string | null;
};

export const workFields = {
  work_role: "Role",
  work_hours: "Weekly hours",
  work_location: "Work location",
} as const;

export function parseWorkChanges(csv: string) {
  const { headers, rows } = parseCsv(csv);
  const expected = ["reference", "role", "weekly hours", "work location"];
  const positions = expected.map((header) =>
    headers.findIndex((value) => value.toLowerCase() === header),
  );
  if (headers.length !== expected.length || positions.includes(-1))
    throw new Error(
      "Use exactly these columns: Reference, Role, Weekly hours, Work location.",
    );

  const references = new Set<string>();
  return rows.map((row, index) => {
    const [reference, role, hours, location] = positions.map((position) =>
      row[position].trim(),
    );
    if (!reference || reference.length > 80 || references.has(reference))
      throw new Error(`Record ${index + 2}: enter a unique worker reference.`);
    references.add(reference);
    if (
      !role ||
      !location ||
      role.length > 120 ||
      location.length > 120 ||
      !/^\d{1,3}(\.\d{1,2})?$/.test(hours) ||
      Number(hours) > 168
    )
      throw new Error(
        `Record ${index + 2}: check the role, location and weekly hours (0–168).`,
      );
    return {
      reference,
      work_role: role,
      work_hours: Number(hours),
      work_location: location,
    };
  });
}

export function changedFields(before: WorkDetails, proposed: WorkDetails) {
  return (Object.keys(workFields) as (keyof WorkDetails)[]).filter(
    (key) => before[key] !== proposed[key],
  );
}
