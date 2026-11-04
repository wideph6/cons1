import { after, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, readBody, requireSuperadmin, requireUser, run } from "@/lib/api";
import { dbError, getBackgroundSettings, requireAppoAccess, type BackgroundSettings } from "@/lib/appo";
import { cleanPlacement, type BackgroundPlacement } from "@/lib/appo-sticker";
import { deleteObject, getObjectBytes, putObject } from "@/lib/r2";
import { makeAppoKey } from "@/lib/appo-r2";
import { db } from "@/lib/supabase";
import { cleanFilename, guessContentType } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * The sticker is only ever drawn on the image the super admin uploaded, which lives in R2 under
 * appo/backgrounds/. Without one there is no sticker, only this message.
 */
const NO_BACKGROUND =
  "The sticker can't be made because no background image has been uploaded. The super admin can upload one from Background image on the Appo page.";
const BACKGROUND_GONE =
  "The sticker can't be made because the background image is missing from storage. The super admin needs to upload it again from Background image on the Appo page.";

/** Served back through a function, whose replies are capped near 4.5 MB on Vercel. */
const MAX_BACKGROUND = 4 * 1024 * 1024;
const BACKGROUND_TYPES = ["image/jpeg", "image/png", "image/webp"];

function info(s: BackgroundSettings) {
  return {
    uploaded: Boolean(s.background_r2_key),
    filename: s.background_filename,
    content_type: s.background_content_type,
    has_frame: s.background_has_frame,
    placement: s.background_placement,
    updated_at: s.updated_at,
  };
}

/** The image itself; whether the app draws the frame on it, and where it sits, travel in headers. */
function image(bytes: Uint8Array, contentType: string, s: BackgroundSettings): Response {
  return new Response(bytes as BodyInit, {
    headers: {
      "content-type": contentType,
      "cache-control": "private, no-store",
      "x-background-has-frame": s.background_has_frame ? "1" : "0",
      "x-background-placement": s.background_placement ? JSON.stringify(s.background_placement) : "",
    },
  });
}

function flag(v: unknown): boolean {
  return v === true || v === "1" || v === "true" || v === "on";
}

/** A placement (with its crop) from the request, or a 400; absent means stretched over the whole sticker. */
function placementFrom(v: unknown): BackgroundPlacement | null {
  if (v === undefined || v === null || v === "") return null;
  let parsed: unknown = v;
  if (typeof v === "string") {
    try {
      parsed = JSON.parse(v);
    } catch {
      parsed = null;
    }
  }
  const p = cleanPlacement(parsed);
  if (!p) throw new ApiError(400, "Invalid position or crop for the background image");
  return p;
}

/**
 * GET /api/admin/appo/background         — the sticker background image itself, or 404 when there is none
 * GET /api/admin/appo/background?info=1  — which one is in use
 */
export async function GET(req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    requireAppoAccess(user);
    const settings = await getBackgroundSettings();
    if (req.nextUrl.searchParams.get("info") === "1") return ok(info(settings));

    if (!settings.background_r2_key) throw new ApiError(404, NO_BACKGROUND);
    const obj = await getObjectBytes(settings.background_r2_key, MAX_BACKGROUND);
    if (!obj) {
      console.error("[appo] sticker background missing from storage", settings.background_r2_key);
      throw new ApiError(404, BACKGROUND_GONE);
    }
    return image(obj.bytes, settings.background_content_type ?? obj.contentType, settings);
  });
}

/**
 * POST /api/admin/appo/background (multipart: file, has_frame, placement) — super admin only; the new
 * image takes the old one's place. has_frame says the image already has the title bar, lines and
 * labels on it; placement (JSON) is where it sits on the sticker and what is cropped off it.
 */
export async function POST(req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    requireSuperadmin(user);

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new ApiError(400, "Expected a multipart form upload");
    }
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "No image was sent");
    if (file.size > MAX_BACKGROUND) throw new ApiError(413, "The background image must be 4 MB or smaller");
    const filename = cleanFilename(file.name);
    const contentType = guessContentType(filename, file.type);
    if (!BACKGROUND_TYPES.includes(contentType)) throw new ApiError(400, "The background must be a JPG, PNG or WebP image");
    const hasFrame = flag(form.get("has_frame"));
    const placement = placementFrom(form.get("placement"));

    const previous = await getBackgroundSettings();
    const key = makeAppoKey("backgrounds", filename);
    await putObject(key, new Uint8Array(await file.arrayBuffer()), contentType);

    const now = new Date().toISOString();
    const saved: BackgroundSettings = {
      background_r2_key: key,
      background_content_type: contentType,
      background_filename: filename,
      background_has_frame: hasFrame,
      background_placement: placement,
      updated_at: now,
    };
    const { error } = await db().from("appo_settings").upsert({ id: true, ...saved, updated_by: user.id });
    if (error) {
      await deleteObject(key);
      throw dbError(error);
    }

    after(async () => {
      if (previous.background_r2_key && previous.background_r2_key !== key) await deleteObject(previous.background_r2_key);
      await logActivity({ user_id: user.id, action: "update_appo_background", details: { filename, has_frame: hasFrame } });
    });
    return ok(info(saved));
  });
}

/** PATCH /api/admin/appo/background { has_frame?, placement? } — super admin only; for the image in use. */
export async function PATCH(req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    requireSuperadmin(user);
    const body = await readBody<{ has_frame?: unknown; placement?: unknown }>(req);
    const current = await getBackgroundSettings();
    if (!current.background_r2_key) throw new ApiError(400, "Upload a background image first");

    const patch: Partial<BackgroundSettings> = {};
    if (body.has_frame !== undefined) patch.background_has_frame = flag(body.has_frame);
    if (body.placement !== undefined) patch.background_placement = placementFrom(body.placement);
    const now = new Date().toISOString();
    const { error } = await db()
      .from("appo_settings")
      .update({ ...patch, updated_by: user.id, updated_at: now })
      .eq("id", true);
    if (error) throw dbError(error);
    return ok(info({ ...current, ...patch, updated_at: now }));
  });
}
