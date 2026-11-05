import { after } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, requireSuperadmin, requireUser, run } from "@/lib/api";
import { dbError, isMissingTable } from "@/lib/appo";
import { cleanDesktop, cleanMobile } from "@/lib/appo-page";
import { assetUrls } from "@/lib/appo-page-server";
import { makeAppoKey } from "@/lib/appo-r2";
import { getObjectBytes, putObject } from "@/lib/r2";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Where New M keeps its page's logos and favicons. Only read from here, never written or deleted. */
const NEW_M_PAGE_KEY_RE = /^new-m\/page\/[0-9a-f-]{36}\/([A-Za-z0-9._-]+)$/;

/** Every New M page image a saved view points at: any { key } inside it under new-m/page/. */
function newMKeys(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) {
    for (const x of v) newMKeys(x, out);
  } else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      if (k === "key" && typeof x === "string" && NEW_M_PAGE_KEY_RE.test(x)) out.add(x);
      else newMKeys(x, out);
    }
  }
  return out;
}

/** The same content with each New M image key swapped for its Appo copy (null when it had none). */
function swapKeys(v: unknown, copies: Map<string, string | null>): unknown {
  if (Array.isArray(v)) return v.map((x) => swapKeys(x, copies));
  if (!v || typeof v !== "object") return v;
  return Object.fromEntries(
    Object.entries(v).map(([k, x]) => [k, k === "key" && typeof x === "string" && copies.has(x) ? copies.get(x) : swapKeys(x, copies)]),
  );
}

/**
 * POST /api/admin/appo/page/from-new-m — New M's verification page as it is saved now, both views, for
 * the Appo page editor to take in. Every logo and favicon it shows is copied in R2 to Appo's own
 * appo/page/, so the two pages never share a file and later changes to one never touch the other.
 *
 * Nothing is saved here: the editor shows the result as unsaved changes, to check and then Save (or
 * undo). A copied image that is never saved is swept up by the storage cleanup, like any unsaved
 * upload. Super admin only.
 */
export async function POST() {
  return run(async () => {
    const user = await requireUser();
    requireSuperadmin(user);

    const { data, error } = await db().from("new_m_page_settings").select("view,content");
    if (error) {
      if (isMissingTable(error)) throw new ApiError(400, "New M's page design is not in the database, so there is nothing to copy.");
      throw dbError(error);
    }
    const rows = (data ?? []) as Array<{ view: string; content: unknown }>;
    const desktopRow = rows.find((r) => r.view === "desktop");
    const mobileRow = rows.find((r) => r.view === "mobile");

    // Each image once, even when both views show it, so Appo's two views share their copy the same way.
    const copies = new Map<string, string | null>();
    const keys = [...newMKeys([desktopRow?.content, mobileRow?.content])];
    await Promise.all(
      keys.map(async (key) => {
        const got = await getObjectBytes(key);
        if (!got) {
          // Gone from storage (or far too large): the Appo view shows the design's own logo there instead.
          copies.set(key, null);
          return;
        }
        const name = NEW_M_PAGE_KEY_RE.exec(key)?.[1] ?? "image";
        const copy = makeAppoKey("page", name);
        await putObject(copy, got.bytes, got.contentType);
        copies.set(key, copy);
      }),
    );

    // Read through Appo's own checks, so the result is exactly what the Appo editor would save.
    const desktop = cleanDesktop(swapKeys(desktopRow?.content ?? {}, copies));
    const mobile = cleanMobile(swapKeys(mobileRow?.content ?? {}, copies));
    const copied = [...copies.values()].filter(Boolean).length;
    const missing = copies.size - copied;

    after(() =>
      logActivity({ user_id: user.id, action: "copy_appo_page_from_new_m", details: { images_copied: copied, images_missing: missing } }),
    );
    return ok({
      desktop,
      mobile,
      assets: await assetUrls(desktop, mobile),
      /** Whether New M had saved each view; a view it never saved is the design's defaults. */
      saved: { desktop: Boolean(desktopRow), mobile: Boolean(mobileRow) },
      images: { copied, missing },
    });
  });
}
