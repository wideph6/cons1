import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, requireSuperadmin, requireUser, run } from "@/lib/api";
import { dbError, getBackgroundSettings, requireNewMAccess, type BackgroundSettings } from "@/lib/new-m";
import { deleteObject, getObjectBytes, makeNewMKey, putObject } from "@/lib/r2";
import { db } from "@/lib/supabase";
import { cleanFilename, guessContentType } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * The built-in background. It sits in assets/, not public/, so the blank form is only handed out to
 * someone signed in to the panel, never served on a public domain. next.config.ts traces it into this
 * route's bundle.
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
    updated_at: s.updated_at,
  };
}

function image(bytes: Uint8Array, contentType: string, source: "custom" | "default"): Response {
  return new Response(bytes as BodyInit, {
    headers: {
      "content-type": contentType,
      "cache-control": "private, no-store",
      "x-background": source,
    },
  });
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
      if (obj) return image(obj.bytes, settings.background_content_type ?? obj.contentType, "custom");
      // Gone from storage: the built-in background keeps stickers working until a new one is set.
      console.error("[new-m] sticker background missing from storage", settings.background_r2_key);
    }
    return image(new Uint8Array(await readFile(DEFAULT_BACKGROUND)), "image/jpeg", "default");
  });
}

/** POST /api/admin/new-m/background (multipart: file) — super admin only; replaces the background. */
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

    const previous = await getBackgroundSettings();
    const key = makeNewMKey("backgrounds", filename);
    await putObject(key, new Uint8Array(await file.arrayBuffer()), contentType);

    const now = new Date().toISOString();
    const { error } = await db().from("new_m_settings").upsert({
      id: true,
      background_r2_key: key,
      background_content_type: contentType,
      background_filename: filename,
      updated_by: user.id,
      updated_at: now,
    });
    if (error) {
      await deleteObject(key);
      throw dbError(error);
    }

    after(async () => {
      if (previous.background_r2_key && previous.background_r2_key !== key) await deleteObject(previous.background_r2_key);
      await logActivity({ user_id: user.id, action: "update_new_m_background", details: { filename } });
    });
    return ok(info({ background_r2_key: key, background_content_type: contentType, background_filename: filename, updated_at: now }));
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
    const { error } = await db().from("new_m_settings").upsert({
      id: true,
      background_r2_key: null,
      background_content_type: null,
      background_filename: null,
      updated_by: user.id,
      updated_at: now,
    });
    if (error) throw dbError(error);

    after(async () => {
      await deleteObject(previous.background_r2_key as string);
      await logActivity({ user_id: user.id, action: "reset_new_m_background", details: { filename: previous.background_filename } });
    });
    return ok(info({ ...previous, background_r2_key: null, background_content_type: null, background_filename: null, updated_at: now }));
  });
}
