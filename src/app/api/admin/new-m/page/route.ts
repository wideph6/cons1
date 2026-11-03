import { after, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, readBody, requireSuperadmin, requireUser, run } from "@/lib/api";
import {
  cleanDesktop,
  cleanMobile,
  DEFAULT_DESKTOP,
  DEFAULT_MOBILE,
  imageKeys,
  PAGE_KEY_RE,
  PAGE_VIEWS,
  type PageView,
} from "@/lib/new-m-page";
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
      assets: await assetUrls(desktop.content, mobile.content),
      table_ready: desktop.table_ready,
    });
  });
}

interface PutBody {
  view?: string;
  content?: unknown;
  /** When the editor loaded the page; a later save by someone else is not silently overwritten. */
  base_updated_at?: string | null;
  /**
   * Logos the editor still shows in the other view, saved there or not yet. They are never deleted by
   * this save, so a logo moved from one view to the other survives saving the views one after another.
   */
  keep?: unknown;
}

/** PUT /api/admin/new-m/page { view, content, base_updated_at, keep } — saves one view. Super admin only. */
export async function PUT(req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    requireSuperadmin(user);
    const body = await readBody<PutBody>(req);
    if (!PAGE_VIEWS.includes(body.view as PageView)) throw new ApiError(400, "view must be 'desktop' or 'mobile'");
    const view = body.view as PageView;

    const [desktop, mobile] = await Promise.all([getDesktop(), getMobile()]);
    const current = view === "desktop" ? desktop : mobile;
    const other = view === "desktop" ? mobile : desktop;
    if (body.base_updated_at !== undefined && (body.base_updated_at ?? null) !== current.updated_at) {
      throw new ApiError(
        409,
        `Someone saved the ${view} view after you opened it. Reload to see their changes, then edit again.`,
      );
    }
    const content = view === "desktop" ? cleanDesktop(body.content) : cleanMobile(body.content);

    // Every logo the page now points at must really be in storage.
    const before = new Set(imageKeys(current.content));
    const now = imageKeys(content);
    const added = now.filter((k) => !before.has(k));
    const heads = await Promise.all(added.map((k) => headObject(k)));
    if (heads.some((h) => !h)) throw new ApiError(400, "An uploaded logo was not found in storage. Please upload it again.");

    const updated_at = await savePage(view, content, user.id);
    // A logo this view no longer shows is deleted, unless the other view still shows it (as saved, or in
    // the editor about to be saved).
    const stillShown = Array.isArray(body.keep) ? body.keep.filter((k): k is string => typeof k === "string" && PAGE_KEY_RE.test(k)) : [];
    const keep = new Set([...now, ...imageKeys(other.content), ...stillShown]);
    const removed = [...before].filter((k) => !keep.has(k));

    after(async () => {
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
