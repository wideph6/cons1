import type { NextRequest } from "next/server";
import { ApiError, intParam, ok, requirePermission, requireUser, run } from "@/lib/api";
import { FILE_SELECT, mapFile } from "@/lib/files";
import { db } from "@/lib/supabase";

/**
 * GET /api/admin/files?link_id=            — files in a link
 * GET /api/admin/files?search=1&from=&to=&date_field=uploaded_at|updated_at&domain_id=&link_id=&q=&uploaded_by=&limit=&offset=
 */
export async function GET(req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    const sp = req.nextUrl.searchParams;
    const isSearch = sp.get("search") === "1";
    if (isSearch) requirePermission(user, "search");

    const limit = intParam(sp.get("limit"), isSearch ? 50 : 500, 1, 500);
    const offset = intParam(sp.get("offset"), 0, 0, 1_000_000);
    const dateField = sp.get("date_field") === "updated_at" ? "updated_at" : "uploaded_at";
    const sort = sp.get("sort") ?? (isSearch ? dateField : "filename");
    const dir = sp.get("dir") === "asc" ? true : sp.get("dir") === "desc" ? false : !isSearch;
    const sortable = new Set(["filename", "size", "uploaded_at", "updated_at", "download_count"]);

    let q = db().from("files").select(FILE_SELECT, { count: "exact" });

    const linkId = sp.get("link_id");
    if (linkId) q = q.eq("link_id", linkId);
    const domainId = sp.get("domain_id");
    if (domainId) q = q.eq("links.domain_id", domainId);
    const uploadedBy = sp.get("uploaded_by");
    if (uploadedBy) q = q.eq("uploaded_by", uploadedBy);
    const from = sp.get("from");
    if (from) {
      const d = new Date(from);
      if (Number.isNaN(d.getTime())) throw new ApiError(400, "Invalid 'from' date");
      q = q.gte(dateField, d.toISOString());
    }
    const to = sp.get("to");
    if (to) {
      const d = new Date(to);
      if (Number.isNaN(d.getTime())) throw new ApiError(400, "Invalid 'to' date");
      q = q.lte(dateField, d.toISOString());
    }
    const text = (sp.get("q") ?? "").trim();
    if (text) q = q.ilike("filename", `%${text.replace(/[%_]/g, "\\$&")}%`);
    const ext = (sp.get("ext") ?? "").trim().replace(/^\./, "");
    if (ext) q = q.ilike("filename", `%.${ext}`);

    q = q.order(sortable.has(sort) ? sort : "filename", { ascending: dir }).range(offset, offset + limit - 1);

    const { data, error, count } = await q;
    if (error) throw new ApiError(500, error.message);

    return ok({ items: (data ?? []).map((f) => mapFile(f as never)), total: count ?? 0, limit, offset });
  });
}
