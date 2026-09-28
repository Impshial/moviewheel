import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { sessionCookieOptions } from "./cookies";
import { HttpError } from "../http";

export function configured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}
export function publicConfig() {
  if (!configured())
    throw new HttpError(
      "Supabase is not configured yet. Add the project settings to .env.local.",
      503,
    );
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key: (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
  };
}
export async function serverSupabase() {
  const { url, key } = publicConfig();
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (values) => {
        try {
          for (const { name, value, options } of values)
            store.set(
              name,
              value,
              sessionCookieOptions(options, value === "" || options.maxAge === 0),
            );
        } catch {
          // Server Components cannot write; proxy.ts refreshes the cookies before rendering.
        }
      },
    },
  });
}
export function adminSupabase() {
  const { url } = publicConfig();
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new HttpError("The server-only Supabase key is not configured.", 503);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
