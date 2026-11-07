import { ApiError, ok, requireUser, run } from "@/lib/api";
import { FILE_SELECT, mapFile } from "@/lib/files";
import { isCommission } from "@/lib/review";
import { db } from "@/lib/supabase";

export async function GET() {
  return run(async () => {
    const user = await requireUser();

    // A commission user's dashboard shows only their own work.
    const commission = isCommission(user);
    const { data: stats, error } = commission ? { data: null, error: null } : await db().rpc("dashboard_stats");
    if (error) throw new ApiError(500, error.message);

    let activityQuery = db()
      .from("activity_log")
      .select("*, users(name,email)")
      .order("created_at", { ascending: false })
      .limit(10);
    if (user.role !== "superadmin") activityQuery = activityQuery.eq("user_id", user.id);
    const { data: activity } = await activityQuery;

    let filesQuery = db().from("files").select(FILE_SELECT).order("uploaded_at", { ascending: false }).limit(10);
    if (commission) filesQuery = filesQuery.eq("uploaded_by", user.id);
    const { data: recentFiles } = await filesQuery;

    return ok({
      stats,
      activity: (activity ?? []).map((a) => {
        const { users, ...rest } = a as typeof a & { users?: { name: string; email: string } | null };
        return { ...rest, user: users ?? null };
      }),
      recent_files: (recentFiles ?? []).map((f) => mapFile(f as never)),
    });
  });
}
