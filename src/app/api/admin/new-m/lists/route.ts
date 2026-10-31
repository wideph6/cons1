import { ok, requireUser, run } from "@/lib/api";
import { getLists, requireNewMAccess } from "@/lib/new-m";

/** GET /api/admin/new-m/lists — the saved document types, offices, authorities and officers. */
export async function GET() {
  return run(async () => {
    const user = await requireUser();
    requireNewMAccess(user);
    return ok(await getLists());
  });
}
