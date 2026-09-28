import { redirect } from "next/navigation";
import { configured, serverSupabase } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { WorkspaceProvider } from "@/features/workspace/provider";
import { AppShell } from "@/features/workspace/shell";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  if (!configured()) redirect("/login");
  const supabase = await serverSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .single();
  if (error || !data) redirect("/login");
  return (
    <WorkspaceProvider initialProfile={data as Profile}>
      <AppShell>{children}</AppShell>
    </WorkspaceProvider>
  );
}
