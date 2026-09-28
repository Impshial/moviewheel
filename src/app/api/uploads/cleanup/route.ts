import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { adminSupabase } from "@/lib/supabase/server";
import { failure, json, sameOrigin } from "@/lib/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { profile } = await requireMember();
    const { ids } = z.object({ ids: z.array(z.uuid()) }).parse(await request.json());
    const admin = adminSupabase();
    const { data, error } = await admin
      .from("upload_objects")
      .select("id,bucket,object_path")
      .eq("user_id", profile.id)
      .eq("state", "deleting")
      .in("id", ids);
    if (error) throw error;
    for (const item of data || []) {
      const removed = await admin.storage.from(item.bucket).remove([item.object_path]);
      if (removed.error) throw removed.error;
      await admin.from("upload_objects").delete().eq("id", item.id).eq("state", "deleting");
    }
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
