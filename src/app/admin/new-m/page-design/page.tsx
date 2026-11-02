import { redirect } from "next/navigation";
import { NewMPageEditor } from "@/components/admin/NewMPageEditor";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** New M → Verification page: the super admin's editor for the public page every link opens. */
export default async function NewMPageDesign() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "superadmin") redirect("/admin/new-m");
  return <NewMPageEditor />;
}
