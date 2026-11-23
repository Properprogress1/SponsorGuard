import { randomBytes } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig, cookieOptions } from "@/lib/auth/config";
import { pageCsp } from "@/lib/security/headers";

const authPaths = new Set([
  "/login",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/auth/confirm",
  "/mfa",
  "/onboarding",
  "/dashboard",
  "/partner-invitation",
]);

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const refreshSession =
    authPaths.has(path) ||
    path === "/workspace" ||
    path.startsWith("/workspace/");
  const privatePage = refreshSession || path === "/share";
  const headers = new Headers(request.headers);
  const nonce = randomBytes(18).toString("base64");
  const csp = pageCsp(nonce, process.env.NODE_ENV === "development");
  headers.set("Content-Security-Policy", csp);
  let response = NextResponse.next({ request: { headers } });

  const config = refreshSession ? authConfig() : null;
  if (config) {
    const supabase = createServerClient(config.url, config.key, {
      cookieOptions,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values, responseHeaders) {
          for (const { name, value } of values)
            request.cookies.set(name, value);
          headers.set("cookie", request.cookies.toString());
          const previous = response;
          response = NextResponse.next({ request: { headers } });
          for (const cookie of previous.cookies.getAll())
            response.cookies.set(cookie);
          for (const { name, value, options } of values)
            response.cookies.set(name, value, options);
          for (const [name, value] of Object.entries(responseHeaders))
            response.headers.set(name, value);
        },
      },
    });
    await supabase.auth.getClaims();
  }

  response.headers.set("Content-Security-Policy", csp);
  if (privatePage) response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!api/|_next/|notifications/unsubscribe|.*\\.).*)"],
};
