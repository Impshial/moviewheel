import { requireMember } from "@/lib/auth";
import { adminSupabase } from "@/lib/supabase/server";
import { failure, HttpError, json } from "@/lib/http";
export const runtime = "nodejs";
export async function GET() {
  try {
    await requireMember();
    const admin = adminSupabase();
    const [chat, avatars] = await Promise.all([
      admin.storage.getBucket("chat-images"),
      admin.storage.getBucket("avatars"),
    ]);
    if (chat.error || avatars.error)
      throw new HttpError("Image storage is not configured yet.", 503);
    return json({
      "chat-images": { maxBytes: chat.data.file_size_limit ?? null },
      avatars: { maxBytes: avatars.data.file_size_limit ?? null },
    });
  } catch (error) {
    return failure(error);
  }
}
