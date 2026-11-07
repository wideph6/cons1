import { after, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, readBody, requireSuperadmin, requireUser, run } from "@/lib/api";
import { cleanNote, decideCase, isCommission, resubmitCase, reviewCount, reviewQueue } from "@/lib/review";
import { CASE_LABELS, CASE_SYSTEMS, type CaseSystem } from "@/lib/review-shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/reviews — everything waiting for the super admin: new cases from commission users and edits
 * to live cases. ?count=1 answers only how many. Super admin only.
 */
export async function GET(req: NextRequest) {
  return run(async () => {
    const me = await requireUser();
    requireSuperadmin(me);
    if (req.nextUrl.searchParams.get("count") === "1") return ok({ count: await reviewCount() });
    return ok(await reviewQueue());
  });
}

/**
 * POST /api/admin/reviews { system, id, decision, note? }
 *   approve  the super admin lets a waiting new case go live; a commission user's earns its commission
 *   reject   the super admin turns it down, with the reason (it stays hidden until its user changes it)
 *   resubmit its commission user sends a turned-down case again as it is
 */
export async function POST(req: NextRequest) {
  return run(async () => {
    const me = await requireUser();
    const body = await readBody<{ system?: string; id?: string; decision?: string; note?: unknown }>(req);
    const system = body.system as CaseSystem;
    if (!CASE_SYSTEMS.includes(system)) throw new ApiError(400, "system must be old_m, new_m or appo");
    const id = String(body.id ?? "");
    if (!id) throw new ApiError(400, "id is required");

    if (body.decision === "resubmit") {
      if (!isCommission(me)) throw new ApiError(400, "Only the commission user who made the case sends it again.");
      await resubmitCase(system, id, me);
      after(() => logActivity({ user_id: me.id, action: "resubmit_case", details: { system, case_id: id } }));
      return ok({ status: "pending" });
    }

    requireSuperadmin(me);
    if (body.decision !== "approve" && body.decision !== "reject") throw new ApiError(400, "decision must be approve, reject or resubmit");
    const approve = body.decision === "approve";
    const note = cleanNote(body.note);
    if (!approve && !note) throw new ApiError(400, "Write why it is turned down, so the user can put it right.");
    const status = await decideCase(system, id, me.id, approve, note);
    after(() =>
      logActivity({
        user_id: me.id,
        action: approve ? "approve_case" : "reject_case",
        details: { system, kind: CASE_LABELS[system], case_id: id, ...(approve ? {} : { note }) },
      }),
    );
    return ok({ status });
  });
}
