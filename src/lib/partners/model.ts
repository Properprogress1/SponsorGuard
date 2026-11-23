export const partnerRoles = {
  viewer: "Viewer",
  hr_user: "HR user",
  admin: "Admin",
} as const;
export type PartnerRole = keyof typeof partnerRoles;
export const defaultBrand = {
  primary_colour: "#202431",
  accent_colour: "#e8c76b",
  logo_data: null,
};
export type PartnerBrand = {
  primary_colour: string;
  accent_colour: string;
  logo_data: string | null;
  partner_name: string;
};
export type Connection = {
  id: string;
  organisation_name: string;
  direction: "client" | "partner";
  role: PartnerRole;
  revoked_at: string | null;
};
export type Invitation = {
  id: string;
  role: PartnerRole;
  expires_at: string;
  accepted_at: string | null;
  cancelled_at: string | null;
};

export function isPartnerRole(value: unknown): value is PartnerRole {
  return typeof value === "string" && Object.hasOwn(partnerRoles, value);
}

export const isBrandColour = (value: string) => /^#[\da-f]{6}$/i.test(value);

export function brandInk(hex: string) {
  const channels = hex.slice(1).match(/../g) ?? [];
  const [red, green, blue] = channels.map((part) => {
    const channel = parseInt(part, 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return luminance > Math.sqrt(0.05 * 1.05) - 0.05 ? "#000000" : "#ffffff";
}
