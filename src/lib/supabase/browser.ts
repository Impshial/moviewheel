"use client";
import { createBrowserClient } from "@supabase/ssr";
import { sessionCookieOptions } from "./cookies";

export function browserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
    {
      cookies: {
        getAll: () =>
          typeof document === "undefined"
            ? []
            : document.cookie
                .split(";")
                .filter(Boolean)
                .map((part) => {
                  const i = part.indexOf("=");
                  return {
                    name: part.slice(0, i).trim(),
                    value: decodeURIComponent(part.slice(i + 1)),
                  };
                }),
        setAll: (values) => {
          for (const { name, value, options } of values) {
            const cookie = sessionCookieOptions(options, value === "" || options.maxAge === 0);
            document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax${cookie.secure ? "; Secure" : ""}${cookie.maxAge === 0 ? "; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT" : ""}`;
          }
        },
      },
    },
  );
}
