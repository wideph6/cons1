import { ApiError, ok, requireUser, run } from "@/lib/api";
import { isMissingTable, NEW_M, NEW_M_MISSING } from "@/lib/files";
import { db } from "@/lib/supabase";
import type { Domain, LinkRow } from "@/lib/types";

/** GET /api/admin/new-m/domains — every domain, with its New M links and their file counts. */
export async function GET() {
  return run(async () => {
    await requireUser();

    const { data: domains, error } = await db().from("domains").select("*").order("hostname");
    if (error) throw new ApiError(500, error.message);

    const { data: links, error: lErr } = await db().from(NEW_M.linksView).select("*").order("path");
    if (lErr) throw new ApiError(500, isMissingTable(lErr) ? NEW_M_MISSING : lErr.message);

    const byDomain = new Map<string, LinkRow[]>();
    for (const l of (links ?? []) as LinkRow[]) {
      const arr = byDomain.get(l.domain_id) ?? [];
      arr.push(l);
      byDomain.set(l.domain_id, arr);
    }

    const items: Domain[] = ((domains ?? []) as Domain[]).map((d) => {
      const ls = byDomain.get(d.id) ?? [];
      return {
        ...d,
        file_count: ls.reduce((s, l) => s + (l.file_count ?? 0), 0),
        total_size: ls.reduce((s, l) => s + Number(l.total_size ?? 0), 0),
        links: ls,
      };
    });

    return ok({ items });
  });
}
