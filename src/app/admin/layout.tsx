import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { SessionProvider } from "@/components/SessionProvider";
import { getCurrentUser } from "@/lib/auth";
import { canSeeOwnAccount } from "@/lib/finance";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // The Finance tab: the super admin always, an admin only when allowed to see their own account.
  const financeVisible = user.role === "superadmin" || (await canSeeOwnAccount(user.id).catch(() => false));
  return (
    <SessionProvider user={user} financeVisible={financeVisible}>
      <AdminShell>{children}</AdminShell>
    </SessionProvider>
  );
}
