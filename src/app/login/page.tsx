import { redirect } from "next/navigation";
import { Login } from "@/features/auth/login";
import { configured, serverSupabase } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export default async function LoginPage() {
  if (configured()) {
    const supabase = await serverSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.rpc("current_member_id");
      if (data) redirect("/");
    }
  }
  return <Login />;
}
