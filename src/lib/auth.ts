import "server-only";
import { createHmac } from "node:crypto";
import { MEMBERS, type Profile } from "./types";
import { serverSupabase } from "./supabase/server";
import { HttpError } from "./http";

export function memberKey(value: unknown): string {
  if (typeof value !== "string" || !MEMBERS.some((name) => name.toLowerCase() === value))
    throw new HttpError("Choose one of the five names.", 400);
  return value;
}
export function internalEmail(key: string) {
  return `${key}@movie-wheel.invalid`;
}
export function pinCredential(key: string, pin: string): string {
  const secret = process.env.PIN_AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new HttpError("PIN authentication needs its one-time server secret. Run setup:env.", 503);
  return (
    "Mw1!" +
    createHmac("sha256", secret).update(`movie-wheel:pin:v1\0${key}\0${pin}`).digest("base64url")
  );
}
export async function requireMember() {
  const supabase = await serverSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new HttpError("Please sign in again.", 401);
  const result = await supabase
    .from("user_profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .single();
  if (result.error || !result.data)
    throw new HttpError("This account is not a Movie Wheel member.", 403);
  return { supabase, user, profile: result.data as Profile };
}
