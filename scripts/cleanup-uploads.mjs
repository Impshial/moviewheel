import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set the Supabase URL and server-only key in .env.local.");
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
let removed = 0;
// Bounded batch, repeatable after any interruption. The database claims records against finalization.
const { data, error } = await admin.rpc("claim_abandoned_uploads");
if (error) throw new Error("Could not claim abandoned uploads. Check migrations and credentials.");
for (const item of data) {
  const result = await admin.storage.from(item.bucket).remove([item.object_path]);
  if (result.error) {
    console.error(`Cleanup deferred for upload ${item.id}. Retry maintenance later.`);
    continue;
  }
  const deleted = await admin
    .from("upload_objects")
    .delete()
    .eq("id", item.id)
    .eq("state", "deleting");
  if (!deleted.error) removed++;
}
console.log(
  `Removed ${removed} abandoned uploads. Attached message images were not eligible for cleanup.`,
);
