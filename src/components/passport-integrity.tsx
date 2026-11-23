import { requireWorkspaceSession } from "@/lib/auth/access";

type Verification = {
  valid: boolean;
  checked_entries: number;
  first_invalid_sequence: number | null;
};

export async function PassportIntegrity({
  organisation,
}: {
  organisation: string;
}) {
  const { client } = await requireWorkspaceSession();
  const { data, error } = await client
    .rpc("verify_chain", { tenant: organisation })
    .single<Verification>();
  if (error || !data) {
    return (
      <section
        aria-labelledby="chain-integrity"
        className="mt-6 rounded-lg border bg-white p-5"
      >
        <h2 id="chain-integrity" className="text-lg font-semibold">
          Ledger integrity
        </h2>
        <p role="alert" className="mt-2 text-sm text-red-900">
          Could not verify the ledger. Reload to try again.
        </p>
      </section>
    );
  }

  const count = new Intl.NumberFormat("en-GB").format(data.checked_entries);
  const title = data.valid
    ? data.checked_entries
      ? "Chain verified"
      : "No ledger entries yet"
    : "Integrity check failed";
  return (
    <section
      aria-labelledby="chain-integrity"
      className="mt-6 grid max-w-2xl gap-3 rounded-lg border bg-white p-5"
    >
      <h2 id="chain-integrity" className="text-lg font-semibold">
        Ledger integrity
      </h2>
      <div
        role="status"
        className={data.valid ? "text-emerald-900" : "text-red-900"}
      >
        <p className="font-semibold">{title}</p>
        <p className="text-sm">
          {count} {data.checked_entries === 1 ? "entry" : "entries"} checked
        </p>
      </div>
      {data.first_invalid_sequence !== null && (
        <p className="text-sm text-slate-800">
          First integrity mismatch at entry {data.first_invalid_sequence}.
        </p>
      )}
      <p className="text-sm text-slate-700">
        The ledger is tamper-evident. Verification checks the entries currently
        stored for this organisation.
      </p>
    </section>
  );
}
