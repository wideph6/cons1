import { after, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, readBody, requireSuperadmin, requireUser, run } from "@/lib/api";
import { cleanDesktop, cleanMobile, DEFAULT_DESKTOP, DEFAULT_MOBILE, imageKeys, PAGE_VIEWS, type PageView } from "@/lib/new-m-page";
import { assetUrls, getDesktop, getMobile, savePage } from "@/lib/new-m-page-server";
import { deleteObject, headObject } from "@/lib/r2";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/new-m/page — the verification page as saved (desktop and mobile), the design's
 * defaults, and signed links to the uploaded logos. Super admin only.
 */
export async function GET() {
  return run(async () => {
    const user = await requireUser();
    requireSuperadmin(user);
    const [desktop, mobile] = await Promise.all([getDesktop(), getMobile()]);
    return ok({
      desktop: { content: desktop.content, updated_at: desktop.updated_at },
      mobile: { content: mobile.content, updated_at: mobile.updated_at },
      defaults: { desktop: DEFAULT_DESKTOP, mobile: DEFAULT_MOBILE },
      assets: await assetUrls(desktop.content),
      table_ready: desktop.table_ready,
    });
  });
}

interface PutBody {
  view?: string;
  content?: unknown;
  /** When the editor loaded the page; a later save by someone else is not silently overwritten. */
  base_updated_at?: string | null;
}

/** PUT /api/admin/new-m/page { view, content, base_updated_at } — saves one view. Super admin only. */
export async function PUT(req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    requireSuperadmin(user);
    const body = await readBody<PutBody>(req);
    if (!PAGE_VIEWS.includes(body.view as PageView)) throw new ApiError(400, "view must be 'desktop' or 'mobile'");
    const view = body.view as PageView;

    if (view === "mobile") {
      const current = await getMobile();
      if (body.base_updated_at !== undefined && (body.base_updated_at ?? null) !== current.updated_at) {
        throw new ApiError(409, "Someone saved the mobile view after you opened it. Reload to see their changes, then edit again.");
      }
      const content = cleanMobile(body.content);
      const updated_at = await savePage("mobile", content, user.id);
      after(() => logActivity({ user_id: user.id, action: "update_new_m_page", details: { view } }));
      return ok({ content, updated_at });
    }

    const current = await getDesktop();
    if (body.base_updated_at !== undefined && (body.base_updated_at ?? null) !== current.updated_at) {
      throw new ApiError(409, "Someone saved the page after you opened it. Reload to see their changes, then edit again.");
    }
    const content = cleanDesktop(body.content);

    // Every logo the page now points at must really be in storage.
    const before = new Set(imageKeys(current.content));
    const now = imageKeys(content);
    const added = now.filter((k) => !before.has(k));
    const heads = await Promise.all(added.map((k) => headObject(k)));
    if (heads.some((h) => !h)) throw new ApiError(400, "An uploaded logo was not found in storage. Please upload it again.");

    const updated_at = await savePage("desktop", content, user.id);
    const removed = [...before].filter((k) => !now.includes(k));

    after(async () => {
      // A replaced or removed logo is not used anywhere else, so it goes with the save.
      for (const k of removed) await deleteObject(k);
      await logActivity({
        user_id: user.id,
        action: "update_new_m_page",
        details: { view, logos_replaced: removed.length },
      });
    });
    return ok({ content, updated_at, assets: await assetUrls(content) });
  });
}
