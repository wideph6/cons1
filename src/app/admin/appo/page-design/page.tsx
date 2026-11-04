import { redirect } from "next/navigation";
import { AppoPageEditor } from "@/components/admin/AppoPageEditor";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Appo → Verification page: the super admin's editor for the public page every link opens. */
export default async function AppoPageDesign() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "superadmin") redirect("/admin/appo");
  return <AppoPageEditor />;
}
