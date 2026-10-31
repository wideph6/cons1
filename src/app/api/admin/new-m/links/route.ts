import type { NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, readBody, requirePermission, requireUser, run } from "@/lib/api";
import { checkTemplate, cleanText, dbError, getMDomain } from "@/lib/new-m";
import { db } from "@/lib/supabase";

/**
 * POST /api/admin/new-m/links  { domain_id, name?, template }
 * The template is everything after the domain, with {attestation_number} and {issue_date} wherever a
 * document's own values belong.
 */
export async function POST(req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "new_m_domains");
    const body = await readBody<{ domain_id?: string; name?: string; template?: string }>(req);
    if (!body.domain_id) throw new ApiError(400, "domain_id is required");

    const domain = await getMDomain(body.domain_id);
    const template = checkTemplate(body.template, domain.hostname);
    const name = cleanText(body.name, "Link name");

    const { data, error } = await db()
      .from("new_m_link_templates")
      .insert({ domain_id: domain.id, name, template, created_by: user.id })
      .select("id,domain_id,name,template,created_at,updated_at")
      .single();
    if (error) {
      if (error.code === "23505") throw new ApiError(409, `${domain.hostname} already has this link`);
      throw dbError(error);
    }

    await logActivity({
      user_id: user.id,
      action: "create_new_m_link",
      domain: { id: null, hostname: domain.hostname },
      details: { name, template },
    });
    return ok({ item: { ...data, document_count: 0 } }, { status: 201 });
  });
}
