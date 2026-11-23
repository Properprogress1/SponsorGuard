import Link from "next/link";
import {
  canEditRecords,
  requireWorkspaceSession,
  type Role,
} from "@/lib/auth/access";
import { formatUkDate } from "@/lib/dates";
import { documentTypes, type DocumentType } from "@/lib/documents/model";
import { getPersonOptions } from "@/lib/people/data";
import { DocumentForm } from "./form";

type Person = { full_name: string };
type Document = {
  id: string;
  document_type: DocumentType;
  issued_on: string | null;
  expires_on: string | null;
  scan_status: "not_scanned" | "clean";
  sponsored_workers: Person | null;
  engaged_individuals: Person | null;
};
type Reminder = {
  document_id: string;
  days_before: number;
  remind_on: string;
  documents: { document_type: DocumentType; expires_on: string };
};

export async function DocumentsWorkspace({
  organisation,
  role,
  params,
}: {
  organisation: string;
  role: Role;
  params: Record<string, string | string[] | undefined>;
}) {
  const { client } = await requireWorkspaceSession();
  const editable = canEditRecords(role);
  const rawPage = typeof params.page === "string" ? Number(params.page) : 1;
  const page =
    Number.isInteger(rawPage) && rawPage >= 1 && rawPage <= 10_000
      ? rawPage
      : 1;
  const size = 25;
  const offset = (page - 1) * size;
  const base = `/workspace/${organisation}/documents`;
  const [listing, reminders, people] = await Promise.all([
    client
      .from("documents")
      .select(
        "id, document_type, issued_on, expires_on, scan_status, sponsored_workers(full_name), engaged_individuals(full_name)",
        { count: "exact" },
      )
      .eq("organisation_id", organisation)
      .eq("state", "ready")
      .order("created_at", { ascending: false })
      .order("id")
      .range(offset, offset + size - 1)
      .returns<Document[]>(),
    client
      .from("document_notifications")
      .select(
        "document_id, days_before, remind_on, documents!inner(document_type, expires_on)",
      )
      .eq("organisation_id", organisation)
      .order("remind_on", { ascending: false })
      .order("document_id")
      .limit(10)
      .returns<Reminder[]>(),
    editable
      ? getPersonOptions(client, organisation, [
          "sponsored_worker_id",
          "engaged_individual_id",
        ])
      : Promise.resolve(null),
  ]);
  if ((listing.error && listing.error.code !== "PGRST103") || reminders.error) {
    throw new Error("Could not load the document vault.");
  }
  const count = listing.count ?? 0;
  const rows = listing.data ?? [];
  const linkClass =
    "font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2";

  return (
    <div className="mt-6 grid gap-7">
      {editable && people && (
        <DocumentForm organisation={organisation} people={people} />
      )}
      <section className="grid gap-4" aria-labelledby="vault-records">
        <div>
          <h2 id="vault-records" className="text-lg font-semibold">
            Document vault
          </h2>
          <p className="mt-1 text-sm text-slate-700">
            {count} {count === 1 ? "document" : "documents"} on file
          </p>
        </div>
        {rows.length ? (
          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Documents on file</caption>
              <thead className="bg-slate-100">
                <tr>
                  <th scope="col" className="p-3">
                    Document
                  </th>
                  <th scope="col" className="p-3">
                    Person
                  </th>
                  <th scope="col" className="p-3">
                    Issued
                  </th>
                  <th scope="col" className="p-3">
                    Expires
                  </th>
                  <th scope="col" className="p-3">
                    Malware check
                  </th>
                  <th scope="col" className="p-3">
                    Download
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((document) => (
                  <tr key={document.id} className="border-t">
                    <th scope="row" className="p-3 font-medium">
                      {documentTypes[document.document_type]}
                    </th>
                    <td className="break-words p-3">
                      {document.sponsored_workers?.full_name ??
                        document.engaged_individuals?.full_name ??
                        "—"}
                    </td>
                    <td className="whitespace-nowrap p-3">
                      {document.issued_on
                        ? formatUkDate(document.issued_on)
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap p-3">
                      {document.expires_on
                        ? formatUkDate(document.expires_on)
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap p-3">
                      {document.scan_status === "clean"
                        ? "Clean"
                        : "Scan not run"}
                    </td>
                    <td className="p-3">
                      <a
                        className={linkClass}
                        href={`${base}/download/${document.id}`}
                        referrerPolicy="no-referrer"
                      >
                        Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-lg border bg-white p-4 text-sm">
            No documents on file in this view.
          </p>
        )}
        {(page > 1 || count > size) && (
          <nav
            aria-label="Document pages"
            className="flex items-center gap-4 text-sm"
          >
            {page > 1 && (
              <Link className={linkClass} href={`${base}?page=${page - 1}`}>
                Previous
              </Link>
            )}
            <span>Page {page}</span>
            {page * size < count && (
              <Link className={linkClass} href={`${base}?page=${page + 1}`}>
                Next
              </Link>
            )}
          </nav>
        )}
      </section>
      <section className="grid gap-3" aria-labelledby="document-reminders">
        <h2 id="document-reminders" className="text-lg font-semibold">
          Latest expiry reminders
        </h2>
        {reminders.data?.length ? (
          <ul className="divide-y rounded-lg border bg-white">
            {reminders.data.map((reminder) => (
              <li
                className="p-3 text-sm"
                key={`${reminder.document_id}-${reminder.days_before}`}
              >
                {documentTypes[reminder.documents.document_type]} ·{" "}
                {reminder.days_before}-day expiry reminder
                {reminder.documents.expires_on && (
                  <> · Expires {formatUkDate(reminder.documents.expires_on)}</>
                )}
                <span className="block text-slate-700">
                  Reminder date {formatUkDate(reminder.remind_on)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-700">No expiry reminders on file.</p>
        )}
      </section>
    </div>
  );
}
