import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { authConfig, cookieOptions } from "./config";

export async function authClient(writable = false) {
  const config = authConfig();
  if (!config) throw new Error("Supabase Auth is not configured");
  const store = await cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions,
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        if (!writable) return; // The proxy refreshes cookies before rendering.
        for (const { name, value, options } of values)
          store.set(name, value, options);
      },
    },
  });
}
