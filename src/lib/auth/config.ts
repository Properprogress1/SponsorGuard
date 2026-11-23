export function authConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url, key };
}

export const cookieOptions = {
  httpOnly: true,
  secure:
    process.env.NODE_ENV === "production" &&
    process.env.SPONSORGUARD_LOCAL_HTTP !== "1",
  sameSite: "lax" as const,
  path: "/",
};
