import type { NextRequest } from "next/server";
import { ApiError, ok, requireSuperadmin, requireUser, run } from "@/lib/api";
import { pageRecordById } from "@/lib/new-m-page-server";

export const dynamic = "force-dynamic";

/** GET /api/admin/new-m/page/record?id= — one document's values as the page shows them, for the editor's preview. */
export async function GET(req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    requireSuperadmin(user);
    const id = req.nextUrl.searchParams.get("id");
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(400, "Pick a document");
    return ok({ record: await pageRecordById(id) });
  });
}
