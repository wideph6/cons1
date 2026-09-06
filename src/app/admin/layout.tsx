import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { SessionProvider } from "@/components/SessionProvider";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <SessionProvider user={user}>
      <AdminShell>{children}</AdminShell>
    </SessionProvider>
  );
}
