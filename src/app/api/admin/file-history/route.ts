import { after, type NextRequest } from "next/server";
import { ApiError, ok, requireSuperadmin, requireUser, run } from "@/lib/api";
import { fileLinks, HISTORY_SYSTEMS, KEEP_DAYS, previousFiles, sweepReplaced, type HistoryFile, type HistorySystem } from "@/lib/file-history";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Where each system keeps a record's file now. */
const CURRENT: Record<HistorySystem, { table: string; key: string; name: string; size: string; type: string; label: string }> = {
  old_m: { table: "files", key: "r2_key", name: "filename", size: "size", type: "content_type", label: "filename" },
  new_m: { table: "new_m_records", key: "doc_r2_key", name: "doc_filename", size: "doc_size", type: "doc_content_type", label: "attestation_number" },
  appo: { table: "appo_records", key: "doc_r2_key", name: "doc_filename", size: "doc_size", type: "doc_content_type", label: "attestation_number" },
};

/**
 * GET /api/admin/file-history?system=old_m|new_m|appo&id=… — a record's file as visitors get it now and
 * the earlier ones still kept (for KEEP_DAYS days after each replace), each with links to show it in the
 * page and to save it. Super admin only.
 */
export async function GET(req: NextRequest) {
  return run(async () => {
    const me = await requireUser();
    requireSuperadmin(me);
    const system = req.nextUrl.searchParams.get("system") as HistorySystem;
    const id = req.nextUrl.searchParams.get("id") ?? "";
    if (!HISTORY_SYSTEMS.includes(system)) throw new ApiError(400, "system must be old_m, new_m or appo");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(400, "Invalid record id");

    const c = CURRENT[system];
    const { data, error } = await db()
      .from(c.table)
      .select(`${c.key},${c.name},${c.size},${c.type},${c.label}`)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new ApiError(500, error.message);
    const row = data as Record<string, unknown> | null;

    let current: HistoryFile | null = null;
    if (row?.[c.key]) {
      current = await fileLinks(
        String(row[c.key]),
        String(row[c.name] ?? "current.pdf"),
        String(row[c.type] ?? "application/pdf"),
        Number(row[c.size] ?? 0),
      );
    }
    const previous = await previousFiles(system, id);
    after(() => sweepReplaced());
    return ok({ label: row ? String(row[c.label] ?? "") : "", current, previous, keep_days: KEEP_DAYS });
  });
}
