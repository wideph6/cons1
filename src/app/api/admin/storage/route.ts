import type { NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, readBody, requireSuperadmin, requireUser, run } from "@/lib/api";
import { isMissingTable } from "@/lib/new-m";
import { deleteObjects, listAllObjects, MANAGED_PREFIX, NEW_M_PREFIX } from "@/lib/r2";
import { db } from "@/lib/supabase";
import type { StorageMismatch, StorageMissing, StorageOrphan, StorageReport } from "@/lib/types";

export const dynamic = "force-dynamic";
// Listing a whole bucket and every file row takes longer than a normal request.
export const maxDuration = 60;

/** An upload still in flight must never look like rubbish, so young objects are never offered for deletion. */
const GRACE_HOURS = 6;
/** PostgREST caps one response at 1000 rows, so file rows are read page by page. */
const PAGE = 1000;

interface FileRowLite {
  id: string;
  filename: string;
  r2_key: string;
  size: number;
  uploaded_at: string;
  links?: { path: string; domains?: { hostname: string } | null } | null;
}

async function allFileRows(): Promise<FileRowLite[]> {
  const out: FileRowLite[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db()
      .from("files")
      .select("id,filename,r2_key,size,uploaded_at,links(path,domains(hostname))")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new ApiError(500, error.message);
    const rows = (data ?? []) as unknown as FileRowLite[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

function place(r: FileRowLite): Pick<StorageMissing, "hostname" | "path"> {
  return { hostname: r.links?.domains?.hostname ?? null, path: r.links?.path ?? null };
}

interface NewMRowLite {
  id: string;
  attestation_number: string;
  doc_filename: string;
  doc_r2_key: string;
  doc_size: number | null;
  officer_signature_r2_key: string | null;
  created_at: string;
  domain_hostname: string | null;
}

/** New M documents carry a PDF and, when an officer was given, a copy of the officer's signature. */
async function allNewMRows(): Promise<NewMRowLite[]> {
  const out: NewMRowLite[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db()
      .from("new_m_view")
      .select("id,attestation_number,doc_filename,doc_r2_key,doc_size,officer_signature_r2_key,created_at,domain_hostname")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) {
      // New M's tables arrive with supabase/new-m.sql; until it has run New M has nothing stored.
      if (isMissingTable(error)) return out;
      throw new ApiError(500, error.message);
    }
    const rows = (data ?? []) as unknown as NewMRowLite[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/** Every saved officer's signature, including ones no document has been given yet. */
async function newMOfficerKeys(): Promise<string[]> {
  const { data, error } = await db().from("new_m_officers").select("signature_r2_key");
  if (error) {
    if (isMissingTable(error)) return [];
    throw new ApiError(500, error.message);
  }
  return (data ?? []).map((o) => o.signature_r2_key as string | null).filter((k): k is string => Boolean(k));
}

/** Compares what the bucket holds with what the database expects to be there. */
async function buildReport(): Promise<StorageReport> {
  const [files, newM, rows, mRows, mOfficerKeys] = await Promise.all([
    listAllObjects(MANAGED_PREFIX),
    listAllObjects(NEW_M_PREFIX),
    allFileRows(),
    allNewMRows(),
    newMOfficerKeys(),
  ]);

  const objects = [...files.objects, ...newM.objects];
  const truncated = files.truncated || newM.truncated;

  const byKey = new Map(objects.map((o) => [o.key, o]));
  const usedKeys = new Set(rows.map((r) => r.r2_key));
  // New M keys live under new-m/, so they too must be registered or cleanup would call them rubbish.
  for (const m of mRows) {
    usedKeys.add(m.doc_r2_key);
    if (m.officer_signature_r2_key) usedKeys.add(m.officer_signature_r2_key);
  }
  for (const k of mOfficerKeys) usedKeys.add(k);

  const now = Date.now();

  const orphans: StorageOrphan[] = objects
    .filter((o) => !usedKeys.has(o.key))
    .map((o) => {
      const ageHours = o.last_modified ? (now - new Date(o.last_modified).getTime()) / 3_600_000 : null;
      return {
        key: o.key,
        size: o.size,
        last_modified: o.last_modified,
        age_hours: ageHours === null ? null : Math.round(ageHours * 10) / 10,
        // A partial listing cannot prove an object is unused, so nothing is deletable then.
        deletable: !truncated && ageHours !== null && ageHours >= GRACE_HOURS,
      };
    })
    .sort((a, b) => b.size - a.size);

  const missing: StorageMissing[] = [];
  const mismatched: StorageMismatch[] = [];
  // With a partial listing a row's object may simply be past the cut, so "missing" would be a false alarm.
  if (!truncated) {
    for (const r of rows) {
      const base = {
        id: r.id,
        filename: r.filename,
        r2_key: r.r2_key,
        size: Number(r.size ?? 0),
        uploaded_at: r.uploaded_at,
        ...place(r),
      };
      const o = byKey.get(r.r2_key);
      if (!o) missing.push(base);
      else if (o.size !== base.size) mismatched.push({ ...base, real_size: o.size });
    }

    for (const m of mRows) {
      const base = {
        id: m.id,
        filename: m.doc_filename,
        r2_key: m.doc_r2_key,
        size: Number(m.doc_size ?? 0),
        uploaded_at: m.created_at,
        hostname: m.domain_hostname,
        path: `new-m ${m.attestation_number}`,
        new_m: true,
      };
      const o = byKey.get(m.doc_r2_key);
      if (!o) missing.push(base);
      else if (o.size !== base.size) mismatched.push({ ...base, real_size: o.size });
    }
  }

  const deletable = orphans.filter((o) => o.deletable);
  const mBytes = mRows.reduce((s, m) => s + Number(m.doc_size ?? 0), 0);
  return {
    bucket_objects: objects.length,
    bucket_bytes: objects.reduce((s, o) => s + o.size, 0),
    db_files: rows.length + mRows.length,
    db_bytes: rows.reduce((s, r) => s + Number(r.size ?? 0), 0) + mBytes,
    orphans,
    orphan_bytes: orphans.reduce((s, o) => s + o.size, 0),
    deletable_orphans: deletable.length,
    deletable_bytes: deletable.reduce((s, o) => s + o.size, 0),
    missing,
    mismatched,
    grace_hours: GRACE_HOURS,
    truncated,
    checked_at: new Date().toISOString(),
  };
}

/** GET /api/admin/storage — what the bucket holds versus what the database expects. */
export async function GET() {
  return run(async () => {
    const user = await requireUser();
    requireSuperadmin(user);
    return ok({ report: await buildReport() });
  });
}

/**
 * POST /api/admin/storage  { keys?: string[] }
 * Deletes leftovers from uploads that never finished. The orphan list is rebuilt here rather than
 * trusted from the request, so a stale page can never delete an object that now belongs to a file.
 */
export async function POST(req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    requireSuperadmin(user);
    const body = await readBody<{ keys?: string[] }>(req);
    const requested = Array.isArray(body.keys) ? body.keys.filter((k) => typeof k === "string") : null;

    const before = await buildReport();
    if (before.truncated) {
      throw new ApiError(
        409,
        "The bucket holds more objects than one report can list, so cleanup is switched off. Remove them from the Cloudflare dashboard instead.",
      );
    }

    const deletable = before.orphans.filter((o) => o.deletable);
    const chosen = requested ? deletable.filter((o) => requested.includes(o.key)) : deletable;
    if (!chosen.length) {
      throw new ApiError(
        400,
        `Nothing to clean up. Leftovers younger than ${GRACE_HOURS} hours are left alone in case an upload is still finishing.`,
      );
    }

    await deleteObjects(chosen.map((o) => o.key));
    const bytes = chosen.reduce((s, o) => s + o.size, 0);

    await logActivity({
      user_id: user.id,
      action: "cleanup_storage",
      details: { objects: chosen.length, bytes },
    });

    // Re-read, so the numbers shown afterwards are what the bucket actually holds now.
    return ok({ deleted: chosen.length, bytes, report: await buildReport() });
  });
}
