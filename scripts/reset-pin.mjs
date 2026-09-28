import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { createInterface } from "node:readline/promises";
const member = process.argv[2]?.toLowerCase();
if (!["abby", "darren", "elisabeth", "hannah", "paul"].includes(member))
  throw new Error(
    "Usage: pnpm maintenance:pin <name>. This changes only that existing member's PIN.",
  );
if (!process.env.PIN_AUTH_SECRET)
  throw new Error("The original PIN_AUTH_SECRET is required. Do not generate a new secret.");
// Read from a dedicated environment variable or masked terminal; never accept a PIN in shell arguments.
let pin = process.env.MOVIE_WHEEL_RECOVERY_PIN;
if (!pin) {
  if (!process.stdin.isTTY)
    throw new Error("Set MOVIE_WHEEL_RECOVERY_PIN securely for a noninteractive reset.");
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  process.stdout.write("New six-digit PIN (input hidden): ");
  const original = readline._writeToOutput;
  readline._writeToOutput = () => {};
  pin = await readline.question("");
  readline._writeToOutput = original;
  readline.close();
  process.stdout.write("\n");
}
if (!/^\d{6}$/.test(pin)) throw new Error("The PIN must contain exactly six digits.");
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const { data, error } = await admin
  .from("user_profiles")
  .select("auth_user_id")
  .eq("member_key", member)
  .single();
if (error || !data?.auth_user_id)
  throw new Error("This member has not set up a PIN yet. Use first-time setup in the app.");
const password =
  "Mw1!" +
  createHmac("sha256", process.env.PIN_AUTH_SECRET)
    .update(`movie-wheel:pin:v1\0${member}\0${pin}`)
    .digest("base64url");
const result = await admin.auth.admin.updateUserById(data.auth_user_id, { password });
pin = undefined;
if (result.error) throw new Error("PIN reset failed. Check the project configuration.");
console.log(
  `The existing ${member} account's PIN was changed. Identity and shared content were preserved.`,
);
