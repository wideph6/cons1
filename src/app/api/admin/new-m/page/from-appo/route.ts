import { after } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, requireSuperadmin, requireUser, run } from "@/lib/api";
import { dbError, isMissingTable } from "@/lib/new-m";
import { cleanDesktop, cleanMobile } from "@/lib/new-m-page";
import { assetUrls } from "@/lib/new-m-page-server";
import { getObjectBytes, makeNewMKey, putObject } from "@/lib/r2";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Where Appo keeps its page's logos and favicons. Only read from here, never written or deleted. */
const APPO_PAGE_KEY_RE = /^appo\/page\/[0-9a-f-]{36}\/([A-Za-z0-9._-]+)$/;

/** Every Appo page image a saved view points at: any { key } inside it under appo/page/. */
function appoKeys(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) {
    for (const x of v) appoKeys(x, out);
  } else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      if (k === "key" && typeof x === "string" && APPO_PAGE_KEY_RE.test(x)) out.add(x);
      else appoKeys(x, out);
    }
  }
  return out;
}

/** The same content with each Appo image key swapped for its New M copy (null when it had none). */
function swapKeys(v: unknown, copies: Map<string, string | null>): unknown {
  if (Array.isArray(v)) return v.map((x) => swapKeys(x, copies));
  if (!v || typeof v !== "object") return v;
  return Object.fromEntries(
    Object.entries(v).map(([k, x]) => [k, k === "key" && typeof x === "string" && copies.has(x) ? copies.get(x) : swapKeys(x, copies)]),
  );
}

/**
 * POST /api/admin/new-m/page/from-appo — Appo's verification page as it is saved now, both views, for
 * the New M page editor to take in. Every logo and favicon it shows is copied in R2 to New M's own
 * new-m/page/, so the two pages never share a file and later changes to one never touch the other.
 *
 * The verification record's entries differ between the two (Appo has its own rows and certificate
 * box); New M's editor keeps its own entries and takes everything else. Nothing is saved here: the
 * editor shows the result as unsaved changes, to check and then Save (or undo). A copied image that
 * is never saved is swept up by the storage cleanup, like any unsaved upload. Super admin only.
 */
export async function POST() {
  return run(async () => {
    const user = await requireUser();
    requireSuperadmin(user);

    const { data, error } = await db().from("appo_page_settings").select("view,content");
    if (error) {
      if (isMissingTable(error)) throw new ApiError(400, "Appo's page design is not in the database, so there is nothing to copy.");
      throw dbError(error);
    }
    const rows = (data ?? []) as Array<{ view: string; content: unknown }>;
    const desktopRow = rows.find((r) => r.view === "desktop");
    const mobileRow = rows.find((r) => r.view === "mobile");

    // Each image once, even when both views show it, so New M's two views share their copy the same way.
    const copies = new Map<string, string | null>();
    const keys = [...appoKeys([desktopRow?.content, mobileRow?.content])];
    await Promise.all(
      keys.map(async (key) => {
        const got = await getObjectBytes(key);
        if (!got) {
          // Gone from storage (or far too large): the New M view shows the design's own logo there instead.
          copies.set(key, null);
          return;
        }
        const name = APPO_PAGE_KEY_RE.exec(key)?.[1] ?? "image";
        const copy = makeNewMKey("page", name);
        await putObject(copy, got.bytes, got.contentType);
        copies.set(key, copy);
      }),
    );

    // Read through New M's own checks, so the result is exactly what the New M editor would save.
    const desktop = cleanDesktop(swapKeys(desktopRow?.content ?? {}, copies));
    const mobile = cleanMobile(swapKeys(mobileRow?.content ?? {}, copies));
    const copied = [...copies.values()].filter(Boolean).length;
    const missing = copies.size - copied;

    after(() =>
      logActivity({ user_id: user.id, action: "copy_new_m_page_from_appo", details: { images_copied: copied, images_missing: missing } }),
    );
    return ok({
      desktop,
      mobile,
      assets: await assetUrls(desktop, mobile),
      /** Whether Appo had saved each view; a view it never saved is the design's defaults. */
      saved: { desktop: Boolean(desktopRow), mobile: Boolean(mobileRow) },
      images: { copied, missing },
    });
  });
}
