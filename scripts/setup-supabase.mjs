import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||= process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
process.env.SUPABASE_SECRET_KEY ||= process.env.SUPABASE_SERVICE_ROLE_KEY;

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_PASSWORD",
  "PIN_AUTH_SECRET",
];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Setup needs: ${missing.join(", ")}. Add them to .env.local. No changes applied.`);
  process.exit(1);
}
const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
const ref = url.hostname.split(".")[0];
if (!/^[a-z0-9]+$/.test(ref) || !url.hostname.endsWith(".supabase.co"))
  throw new Error("Use the project's standard Supabase URL for CLI setup.");
if (
  url.protocol !== "https:" ||
  url.pathname !== "/" ||
  url.search ||
  url.hash ||
  url.username ||
  url.password ||
  url.port
)
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL must be the project base URL: https://<project-ref>.supabase.co. Remove /rest/v1 or any other API path, query parameters, or fragment. No setup changes applied.",
  );
const admin = createClient(url.origin, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
function storageFailure(action, error) {
  const status = error.statusCode || error.status || "network error";
  return new Error(
    `${action} failed (${status}). Check the project base URL, server-only Supabase key, and network connection. Earlier successful setup steps are preserved; rerun setup after correcting the issue.`,
  );
}
const management = async (path, method = "GET", body) => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok)
    throw new Error(
      `Supabase configuration request failed (${response.status}); check project access. Credentials were not logged.`,
    );
  return response.json();
};
// Inspect provider constraints BEFORE writing bucket settings. Do not invent an application size cap.
const [project, storage, buckets] = await Promise.all([
  management(""),
  management("/config/storage"),
  admin.storage.listBuckets(),
]);
if (buckets.error) throw storageFailure("Storage access check before migrations", buckets.error);
const maximum = Number(storage.fileSizeLimit);
if (!Number.isSafeInteger(maximum) || maximum <= 0)
  throw new Error(
    "Could not determine the project's actual Storage size limit. No migrations applied.",
  );
const packageRunner = process.env.npm_execpath;
if (!packageRunner?.includes("pnpm"))
  throw new Error("Run this command through pnpm: pnpm setup:supabase");
function cli(args) {
  const result = spawnSync(process.execPath, [packageRunner, "dlx", "supabase@2.118.0", ...args], {
    stdio: "inherit",
    env: process.env,
    cwd: new URL("..", import.meta.url),
  });
  if (result.status !== 0)
    throw new Error("Supabase CLI did not complete. No subsequent setup steps ran.");
}
cli(["link", "--project-ref", ref]);
cli(["db", "push", "--linked", "--yes"]);
await management("/config/auth", "PATCH", {
  disable_signup: true,
  external_anonymous_users_enabled: false,
  security_update_password_require_reauthentication: false,
  security_update_password_require_current_password: true,
});
for (const bucket of ["chat-images", "avatars", "avatar-presets"]) {
  const existing = await admin.storage.getBucket(bucket);
  if (existing.error) throw storageFailure(`Inspecting ${bucket}`, existing.error);
  const limit = existing.data.file_size_limit
    ? Math.min(existing.data.file_size_limit, maximum)
    : maximum;
  const updated = await admin.storage.updateBucket(bucket, {
    public: false,
    fileSizeLimit: limit,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  });
  if (updated.error) throw storageFailure(`Configuring ${bucket}`, updated.error);
  console.log(`${bucket}: private; effective file limit ${(limit / 1048576).toFixed(1)} MB.`);
}
const profiles = await admin.from("user_profiles").select("display_name").order("display_name");
if (profiles.error || profiles.data.length !== 5)
  throw new Error("Expected exactly five seeded profiles.");
console.log(
  `Setup complete for project ${ref}. Supabase region: ${project.region}. Choose the corresponding Vercel function region when deploying.`,
);
console.log("No user PINs were assigned and no Vercel deployment was created.");
