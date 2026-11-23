"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { uploadDocument } from "@/lib/documents/actions";
import { allowedDocumentTypes, documentTypes } from "@/lib/documents/model";
import type { PersonOptions } from "@/lib/people/data";

const fieldClass =
  "min-h-11 w-full rounded-md border border-slate-500 bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2";

export function DocumentForm({
  organisation,
  people,
}: {
  organisation: string;
  people: PersonOptions;
}) {
  const [state, submit, pending] = useActionState(
    uploadDocument.bind(null, organisation),
    {},
  );
  const uploadInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state.message && uploadInput.current) uploadInput.current.value = "";
  }, [state]);
  const [draft, setDraft] = useState({
    documentType: "",
    personKind: "worker",
    person: "",
    issuedOn: "",
    expiresOn: "",
  });
  const choices =
    draft.personKind === "worker"
      ? people.sponsored_worker_id
      : people.engaged_individual_id;

  return (
    <section
      className="max-w-2xl rounded-lg border bg-white p-5"
      aria-labelledby="upload-document"
    >
      <h2 id="upload-document" className="mb-4 text-lg font-semibold">
        Upload a document
      </h2>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          startTransition(() => submit(data));
        }}
      >
        <div className="grid gap-2">
          <label htmlFor="document-type" className="text-sm font-semibold">
            Document type
          </label>
          <select
            id="document-type"
            name="documentType"
            required
            className={fieldClass}
            value={draft.documentType}
            onChange={(event) =>
              setDraft({ ...draft, documentType: event.target.value })
            }
          >
            <option value="">Choose a type</option>
            {Object.entries(documentTypes).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <label
            htmlFor="document-person-kind"
            className="text-sm font-semibold"
          >
            Person type
          </label>
          <select
            id="document-person-kind"
            name="personKind"
            className={fieldClass}
            value={draft.personKind}
            onChange={(event) =>
              setDraft({ ...draft, personKind: event.target.value, person: "" })
            }
          >
            <option value="worker">Sponsored worker</option>
            <option value="individual">Engaged individual</option>
          </select>
        </div>
        <div className="grid gap-2">
          <label htmlFor="document-person" className="text-sm font-semibold">
            Person
          </label>
          <input
            id="document-person"
            name="person"
            list="vault-people"
            required
            className={fieldClass}
            aria-describedby="document-person-hint"
            autoComplete="off"
            value={draft.person}
            onChange={(event) =>
              setDraft({ ...draft, person: event.target.value })
            }
          />
          <datalist id="vault-people">
            {choices.map((person) => (
              <option
                key={person.id}
                value={person.id}
                label={`${person.full_name} · ${person.reference}`}
              />
            ))}
          </datalist>
          <p id="document-person-hint" className="text-sm text-slate-700">
            Choose a suggestion or paste a record ID from People.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <label htmlFor="document-issued" className="text-sm font-semibold">
              Issue date (optional)
            </label>
            <input
              id="document-issued"
              name="issuedOn"
              maxLength={10}
              className={fieldClass}
              aria-describedby="document-dates-hint"
              value={draft.issuedOn}
              onChange={(event) =>
                setDraft({ ...draft, issuedOn: event.target.value })
              }
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="document-expires" className="text-sm font-semibold">
              Expiry date (optional)
            </label>
            <input
              id="document-expires"
              name="expiresOn"
              maxLength={10}
              className={fieldClass}
              aria-describedby="document-dates-hint"
              value={draft.expiresOn}
              onChange={(event) =>
                setDraft({ ...draft, expiresOn: event.target.value })
              }
            />
          </div>
          <p
            id="document-dates-hint"
            className="text-sm text-slate-700 sm:col-span-2"
          >
            Use DD/MM/YYYY.
          </p>
        </div>
        <div className="grid gap-2">
          <label htmlFor="document-file" className="text-sm font-semibold">
            Document file
          </label>
          <input
            id="document-file"
            ref={uploadInput}
            type="file"
            name="file"
            accept={allowedDocumentTypes}
            required
            aria-describedby="document-file-hint"
            className={fieldClass}
          />
          <p id="document-file-hint" className="text-sm text-slate-700">
            PDF, JPEG or PNG, up to 5 MiB.
          </p>
        </div>
        {state.error && (
          <p role="alert" className="text-sm font-medium text-red-900">
            {state.error}
          </p>
        )}
        {state.message && (
          <p role="status" className="text-sm font-medium text-emerald-900">
            {state.message}
          </p>
        )}
        <Button type="submit" disabled={pending} className="justify-self-start">
          {pending ? "Uploading…" : "Upload document"}
        </Button>
      </form>
    </section>
  );
}
