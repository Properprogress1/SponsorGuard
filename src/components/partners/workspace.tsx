import {
  isManager,
  requireWorkspaceSession,
  type Role,
} from "@/lib/auth/access";
import { londonTime } from "@/lib/passport/model";
import {
  defaultBrand,
  partnerRoles,
  type Connection,
  type Invitation,
  type PartnerBrand,
} from "@/lib/partners/model";
import {
  InviteCancelForm,
  PartnerAccessForm,
  PartnerBrandForm,
  PartnerInviteForm,
} from "./forms";

export async function PartnersWorkspace({
  organisation,
  role,
  brand,
}: {
  organisation: string;
  role: Role;
  brand: PartnerBrand | null;
}) {
  const { client } = await requireWorkspaceSession();
  const manager = isManager(role);
  const [connections, invitations] = await Promise.all([
    client.rpc("list_partner_connections", { tenant: organisation }),
    brand && manager
      ? client
          .from("partner_invitations")
          .select("id, role, expires_at, accepted_at, cancelled_at")
          .eq("partner_id", organisation)
          .order("created_at", { ascending: false })
          .limit(50)
          .returns<Invitation[]>()
      : null,
  ]);
  if (
    connections.error ||
    !Array.isArray(connections.data) ||
    invitations?.error
  )
    return (
      <p role="alert" className="mt-5">
        Could not load partner access.
      </p>
    );
  const links = connections.data as Connection[];
  const now = new Date();

  return (
    <div className="mt-5 grid gap-6">
      {role === "owner" && (
        <section className="grid gap-3 rounded-md border bg-white p-4">
          <h2 className="text-lg font-semibold">Partner branding</h2>
          <p className="text-sm text-slate-700">
            Save branding to use this organisation as a partner. It appears when
            your team opens linked client workspaces.
          </p>
          <PartnerBrandForm
            organisation={organisation}
            brand={brand ?? defaultBrand}
          />
        </section>
      )}
      {brand && manager && (
        <section
          className="grid gap-3 rounded-md border bg-white p-4"
          aria-labelledby="partner-invite"
        >
          <h2 id="partner-invite" className="text-lg font-semibold">
            Invite a client
          </h2>
          <p className="text-sm text-slate-700">
            Share the invitation link with the client owner. It expires after
            seven days and access begins only after they accept.
          </p>
          <PartnerInviteForm organisation={organisation} />
          {invitations?.data?.length ? (
            <ul className="divide-y">
              {invitations.data.map((invite) => {
                const status = invite.accepted_at
                  ? "Accepted"
                  : invite.cancelled_at
                    ? "Cancelled"
                    : Date.parse(invite.expires_at) <= now.getTime()
                      ? "Expired"
                      : "Pending";
                return (
                  <li
                    key={invite.id}
                    className="flex flex-wrap justify-between gap-2 py-2 text-sm"
                  >
                    <p>
                      {partnerRoles[invite.role]} · {status} · Expires{" "}
                      {londonTime(invite.expires_at)}
                    </p>
                    {status === "Pending" && (
                      <InviteCancelForm
                        organisation={organisation}
                        invitation={invite.id}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
      )}
      <section className="grid gap-3" aria-labelledby="partner-connections">
        <h2 id="partner-connections" className="text-lg font-semibold">
          Partner connections
        </h2>
        {links.length ? (
          <ul className="divide-y rounded-md border bg-white">
            {links.map((connection) => {
              const editable =
                connection.direction === "partner" && role === "owner";
              const mayRevoke =
                editable || (connection.direction === "client" && manager);
              return (
                <li key={connection.id} className="grid gap-3 p-4">
                  <p className="font-medium">{connection.organisation_name}</p>
                  <p className="text-sm">
                    {connection.direction === "client" ? "Client" : "Partner"} ·{" "}
                    {partnerRoles[connection.role]} ·{" "}
                    {connection.revoked_at ? "Revoked" : "Active"}
                  </p>
                  {!connection.revoked_at && mayRevoke && (
                    <PartnerAccessForm
                      organisation={organisation}
                      connection={connection}
                      editable={editable}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm">No partner connections on file.</p>
        )}
      </section>
    </div>
  );
}
