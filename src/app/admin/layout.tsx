import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { SessionProvider } from "@/components/SessionProvider";
import { getCurrentUser } from "@/lib/auth";
import { canSeeOwnAccount } from "@/lib/finance";
import { reviewCount } from "@/lib/review";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // The Finance tab: the super admin always, an admin only when allowed to see their own account.
  // The super admin also sees how many new cases and edits wait for approval.
  const [financeVisible, reviews] = await Promise.all([
    user.role === "superadmin" ? true : canSeeOwnAccount(user.id).catch(() => false),
    user.role === "superadmin" ? reviewCount().catch(() => 0) : 0,
  ]);
  return (
    <SessionProvider user={user} financeVisible={financeVisible} reviews={reviews}>
      <AdminShell>{children}</AdminShell>
    </SessionProvider>
  );
}
