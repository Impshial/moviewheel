import type { CookieOptions } from "@supabase/ssr";

export function sessionCookieOptions(options: CookieOptions = {}, deleting = false): CookieOptions {
  const result = {
    ...options,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
  };
  if (deleting) return { ...result, maxAge: 0, expires: new Date(0) };
  delete result.maxAge;
  delete result.expires;
  return result;
}
