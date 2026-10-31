import type { NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, readBody, requirePermission, requireUser, run } from "@/lib/api";
import { checkTemplate, cleanText, dbError, requireNewMAccess } from "@/lib/new-m";
import { db } from "@/lib/supabase";
import type { NewMDomain, NewMLink } from "@/lib/types";
import { normalizeHostname } from "@/lib/utils";

/** GET /api/admin/new-m/domains — New M's own domains, each with its links and document counts. */
export async function GET() {
  return run(async () => {
    const user = await requireUser();
    requireNewMAccess(user);

    const [domains, links] = await Promise.all([
      db().from("new_m_domains_view").select("id,hostname,notes,created_at,document_count").order("hostname"),
      db()
        .from("new_m_link_templates_view")
        .select("id,domain_id,name,template,created_at,updated_at,document_count")
        .order("created_at"),
    ]);
    if (domains.error) throw dbError(domains.error);
    if (links.error) throw dbError(links.error);

    const byDomain = new Map<string, NewMLink[]>();
    for (const l of (links.data ?? []) as NewMLink[]) {
      const arr = byDomain.get(l.domain_id) ?? [];
      arr.push(l);
      byDomain.set(l.domain_id, arr);
    }
    const items: NewMDomain[] = ((domains.data ?? []) as Omit<NewMDomain, "links">[]).map((d) => ({
      ...d,
      links: byDomain.get(d.id) ?? [],
    }));
    return ok({ items });
  });
}

interface CreateBody {
  hostname?: string;
  notes?: string;
  /** Optional first link, so a new domain is ready for uploads straight away. */
  link_name?: string;
  link_template?: string;
}

/** POST /api/admin/new-m/domains  { hostname, notes?, link_name?, link_template? } */
export async function POST(req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "new_m_domains");
    const body = await readBody<CreateBody>(req);
    const hostname = normalizeHostname(body.hostname);
    const notes = cleanText(body.notes, "Notes");
    // Checked before anything is saved, so a bad first link never leaves a half-made domain behind.
    const template = body.link_template?.trim() ? checkTemplate(body.link_template, hostname) : null;
    const linkName = cleanText(body.link_name, "Link name");

    const { data, error } = await db()
      .from("new_m_domains")
      .insert({ hostname, notes, created_by: user.id })
      .select("id,hostname")
      .single();
    if (error) {
      if (error.code === "23505") throw new ApiError(409, `${hostname} is already a New M domain`);
      throw dbError(error);
    }

    if (template) {
      const { error: lErr } = await db()
        .from("new_m_link_templates")
        .insert({ domain_id: data.id, name: linkName, template, created_by: user.id });
      if (lErr) throw dbError(lErr);
    }

    await logActivity({
      user_id: user.id,
      action: "create_new_m_domain",
      // activity_log.domain_id points at the Domains page's table, so New M domains go by name only.
      domain: { id: null, hostname },
      details: { first_link: template },
    });
    return ok({ item: data }, { status: 201 });
  });
}
