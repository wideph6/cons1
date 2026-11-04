import { ok, requireUser, run } from "@/lib/api";
import { getLists, requireAppoAccess } from "@/lib/appo";

/** GET /api/admin/appo/lists — the saved document types, offices, authorities and officers. */
export async function GET() {
  return run(async () => {
    const user = await requireUser();
    requireAppoAccess(user);
    return ok(await getLists());
  });
}
