import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, readBody, requireSuperadmin, requireUser, run } from "@/lib/api";
import { dbError, getBackgroundSettings, requireNewMAccess, type BackgroundSettings } from "@/lib/new-m";
import { deleteObject, getObjectBytes, makeNewMKey, putObject } from "@/lib/r2";
import { db } from "@/lib/supabase";
import { cleanFilename, guessContentType } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * The built-in background: the faint pattern and the Seal/Stamp cell, with the title bar, lines and
 * labels left for the app to draw. It sits in assets/, not public/, so the blank form is only handed
 * out to someone signed in to the panel, never served on a public domain. next.config.ts traces it
 * into this route's bundle.
 */
const DEFAULT_BACKGROUND = path.join(process.cwd(), "assets", "new-m", "sticker-background.jpg");

/** Served back through a function, whose replies are capped near 4.5 MB on Vercel. */
const MAX_BACKGROUND = 4 * 1024 * 1024;
const BACKGROUND_TYPES = ["image/jpeg", "image/png", "image/webp"];

function info(s: BackgroundSettings) {
  return {
    custom: Boolean(s.background_r2_key),
    filename: s.background_filename,
    content_type: s.background_content_type,
    has_frame: s.background_has_frame,
    updated_at: s.updated_at,
  };
}

/** The image itself; whether the app should draw the frame on it travels in a header. */
function image(bytes: Uint8Array, contentType: string, source: "custom" | "default", hasFrame: boolean): Response {
  return new Response(bytes as BodyInit, {
    headers: {
      "content-type": contentType,
      "cache-control": "private, no-store",
      "x-background": source,
      "x-background-has-frame": hasFrame ? "1" : "0",
    },
  });
}

function flag(v: unknown): boolean {
  return v === true || v === "1" || v === "true" || v === "on";
}

/**
 * GET /api/admin/new-m/background         — the sticker background image itself
 * GET /api/admin/new-m/background?info=1  — which one is in use
 */
export async function GET(req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    requireNewMAccess(user);
    const settings = await getBackgroundSettings();
    if (req.nextUrl.searchParams.get("info") === "1") return ok(info(settings));

    if (settings.background_r2_key) {
      const obj = await getObjectBytes(settings.background_r2_key, MAX_BACKGROUND);
      if (obj) {
        return image(obj.bytes, settings.background_content_type ?? obj.contentType, "custom", settings.background_has_frame);
      }
      // Gone from storage: fall back to a plain background until a new one is set.
      console.error("[new-m] sticker background missing from storage", settings.background_r2_key);
    }
    try {
      return image(new Uint8Array(await readFile(DEFAULT_BACKGROUND)), "image/jpeg", "default", false);
    } catch {
      // No background bundled either: the sticker is drawn on plain white, with the app drawing the frame.
      return new Response(null, {
        status: 204,
        headers: { "cache-control": "private, no-store", "x-background": "none", "x-background-has-frame": "0" },
      });
    }
  });
}

/**
 * POST /api/admin/new-m/background (multipart: file, has_frame) — super admin only; replaces the
 * background. has_frame says the image already has the title bar, lines and labels on it.
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

    const previous = await getBackgroundSettings();
    const key = makeNewMKey("backgrounds", filename);
    await putObject(key, new Uint8Array(await file.arrayBuffer()), contentType);

    const now = new Date().toISOString();
    const saved: BackgroundSettings = {
      background_r2_key: key,
      background_content_type: contentType,
      background_filename: filename,
      background_has_frame: hasFrame,
      updated_at: now,
    };
    const { error } = await db().from("new_m_settings").upsert({ id: true, ...saved, updated_by: user.id });
    if (error) {
      await deleteObject(key);
      throw dbError(error);
    }

    after(async () => {
      if (previous.background_r2_key && previous.background_r2_key !== key) await deleteObject(previous.background_r2_key);
      await logActivity({ user_id: user.id, action: "update_new_m_background", details: { filename, has_frame: hasFrame } });
    });
    return ok(info(saved));
  });
}

/** PATCH /api/admin/new-m/background { has_frame } — super admin only; for the background in use. */
export async function PATCH(req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    requireSuperadmin(user);
    const body = await readBody<{ has_frame?: unknown }>(req);
    const current = await getBackgroundSettings();
    // The built-in background never has the frame on it.
    if (!current.background_r2_key) throw new ApiError(400, "Only an uploaded background can say it has the frame printed on it");

    const hasFrame = flag(body.has_frame);
    const now = new Date().toISOString();
    const { error } = await db()
      .from("new_m_settings")
      .update({ background_has_frame: hasFrame, updated_by: user.id, updated_at: now })
      .eq("id", true);
    if (error) throw dbError(error);
    return ok(info({ ...current, background_has_frame: hasFrame, updated_at: now }));
  });
}

/** DELETE /api/admin/new-m/background — super admin only; back to the built-in background. */
export async function DELETE() {
  return run(async () => {
    const user = await requireUser();
    requireSuperadmin(user);
    const previous = await getBackgroundSettings();
    if (!previous.background_r2_key) return ok(info(previous));

    const now = new Date().toISOString();
    const cleared: BackgroundSettings = {
      background_r2_key: null,
      background_content_type: null,
      background_filename: null,
      background_has_frame: false,
      updated_at: now,
    };
    const { error } = await db().from("new_m_settings").upsert({ id: true, ...cleared, updated_by: user.id });
    if (error) throw dbError(error);

    after(async () => {
      await deleteObject(previous.background_r2_key as string);
      await logActivity({ user_id: user.id, action: "reset_new_m_background", details: { filename: previous.background_filename } });
    });
    return ok(info(cleared));
  });
}
