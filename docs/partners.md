# Partner access

An organisation owner can use **Partners** to register their organisation as a partner by saving branding. Partner owners and admins can create a client invitation for an email address and choose a role. Copy the link when it appears and send it to the client owner. The token is shown once and expires after seven days. A pending invitation grants no access and can be cancelled.

The recipient signs in with the invited email address, verifies MFA, opens the invitation and selects a workspace they own. They can create their own workspace first if they do not already have one. Accepting records consent for that client and consumes the invitation. Partner staff open active client workspaces from **Client switcher**.

## Roles and revocation

Each link grants Viewer, HR user or Admin access. A staff member's effective role is limited by both their partner membership and the client's grant. Direct membership in a client takes precedence. Only direct partner memberships can confer linked access, so links cannot give access to another partner's clients.

Delegated roles follow the client's plan and the existing permissions for records, reporting, documents, Continuity Guard and audit packs. Client membership administration, billing, partner consent, client organisation settings and public Passport link administration stay with native client roles. Scheduled digests follow native memberships.

A client owner can change the role or revoke access in **Partners**. Changes apply on subsequent reads and writes, including from an existing signed-in session. The partner loses access to the client workspace and client records on revocation. A partner owner or admin can also give up a link. Copies already downloaded remain with their recipient, and short-lived signed download URLs expire normally.

## Branding

Partner owners can set primary and accent colours and upload a PNG or JPEG logo up to 128 KiB. The sidebar applies this branding to the partner's own workspace and to linked client workspaces opened through that partner. A client using their direct membership sees their own workspace branding. The app picks a foreground colour for contrast against each configured background.
