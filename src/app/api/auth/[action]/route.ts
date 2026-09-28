import { z } from "zod";
import { adminSupabase, serverSupabase } from "@/lib/supabase/server";
import { internalEmail, memberKey, pinCredential, requireMember } from "@/lib/auth";
import { failure, HttpError, json, sameOrigin } from "@/lib/http";

export const runtime = "nodejs";
const pin = z.string().regex(/^\d{6}$/, "Enter exactly six digits.");
const loginSchema = z.object({ member: z.string(), pin, confirmPin: pin.optional() });

export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  try {
    sameOrigin(request);
    const { action } = await context.params;
    const body = await request.json();
    if (action === "status") {
      const key = memberKey(body.member);
      const { data, error } = await adminSupabase()
        .from("user_profiles")
        .select("auth_user_id")
        .eq("member_key", key)
        .single();
      if (error)
        throw new HttpError(
          "Account setup is unavailable. Check the Supabase configuration and migrations.",
          503,
        );
      return json({ configured: Boolean(data.auth_user_id) });
    }
    if (action === "logout") {
      const supabase = await serverSupabase();
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw new HttpError("Logout could not be completed. Please try again.", 503);
      return json({ ok: true });
    }
    if (action === "change-pin") {
      const values = z.object({ currentPin: pin, newPin: pin, confirmPin: pin }).parse(body);
      if (values.newPin !== values.confirmPin)
        throw new HttpError("The new PIN entries must match.");
      const { supabase, profile } = await requireMember();
      const { error } = await supabase.auth.updateUser({
        password: pinCredential(profile.member_key, values.newPin),
        current_password: pinCredential(profile.member_key, values.currentPin),
      });
      if (error)
        throw new HttpError(
          "The current PIN was incorrect or the PIN could not be changed. Please try again.",
        );
      return json({ ok: true });
    }
    if (action !== "login" && action !== "setup") throw new HttpError("Unknown action.", 404);
    const values = loginSchema.parse(body);
    const key = memberKey(values.member);
    const password = pinCredential(key, values.pin);
    if (action === "setup") {
      if (values.pin !== values.confirmPin) throw new HttpError("The PIN entries must match.");
      const { error } = await adminSupabase().auth.admin.createUser({
        email: internalEmail(key),
        password,
        email_confirm: true,
      });
      if (error) {
        const { data } = await adminSupabase()
          .from("user_profiles")
          .select("auth_user_id")
          .eq("member_key", key)
          .single();
        if (data?.auth_user_id)
          return json(
            {
              error: "This name now has a PIN. Use the PIN that was successfully created.",
              claimed: true,
            },
            409,
          );
        throw new HttpError("PIN setup could not be completed. Please try again.", 503);
      }
    }
    const supabase = await serverSupabase();
    const { error } = await supabase.auth.signInWithPassword({
      email: internalEmail(key),
      password,
    });
    if (error)
      throw new HttpError(
        action === "setup"
          ? "Your PIN was created. Please sign in with it."
          : "Incorrect PIN. Try again.",
        401,
      );
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
