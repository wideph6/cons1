import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { ok, requireUser, run } from "@/lib/api";
import { requireApposttaRead } from "@/lib/appostta";

const TEMPLATE_PATH = path.join(process.cwd(), "public/appostta/apostille-template.jpg");

/** Read once per server instance — the template is a static asset, not per-request data. */
let cached: string | null = null;

/**
 * GET /api/admin/appostta/template — the fixed certificate background as a data: URI.
 *
 * Same reason as the signature endpoint: the certificate is exported by drawing its SVG onto a
 * canvas, and an <image> pointing at a URL (even same-origin) never loads when that SVG is later
 * used as an image source for the PNG export, so the bytes have to travel inline.
 */
export async function GET(_req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    requireApposttaRead(user);

    if (!cached) {
      const bytes = await readFile(TEMPLATE_PATH);
      cached = `data:image/jpeg;base64,${bytes.toString("base64")}`;
    }
    return ok({ data_uri: cached });
  });
}
