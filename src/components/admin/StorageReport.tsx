"use client";

import { RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/SessionProvider";
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, Loading, PageHeader, errorMessage, useToast } from "@/components/ui";
import { api } from "@/lib/client";
import type { StorageReport as Report } from "@/lib/types";
import { displayPath, formatBytes, formatDateTime } from "@/lib/utils";

function age(hours: number | null): string {
  if (hours === null) return "unknown";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} d`;
}

export function StorageReport() {
  const { isSuper } = useSession();
  const { toast } = useToast();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmClean, setConfirmClean] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ report: Report }>("/api/admin/storage");
      setReport(r.report);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuper) load();
  }, [isSuper, load]);

  async function cleanUp() {
    setCleaning(true);
    try {
      const r = await api<{ deleted: number; bytes: number; report: Report }>("/api/admin/storage", { json: {} });
      setReport(r.report);
      setConfirmClean(false);
      toast(`Removed ${r.deleted} leftover object${r.deleted === 1 ? "" : "s"} (${formatBytes(r.bytes)} freed)`);
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setCleaning(false);
    }
  }

  if (!isSuper) {
    return <Alert tone="warn">Only the super admin can see the storage report.</Alert>;
  }

  const tiles = report
    ? [
        { label: "Objects in storage", value: String(report.bucket_objects), sub: formatBytes(report.bucket_bytes) },
        { label: "Files in the panel", value: String(report.db_files), sub: formatBytes(report.db_bytes) },
        { label: "Leftovers", value: String(report.orphans.length), sub: formatBytes(report.orphan_bytes) },
        { label: "Broken files", value: String(report.missing.length), sub: report.missing.length ? "object missing" : "all present" },
      ]
    : [];

  const clean =
    report && report.orphans.length === 0 && report.missing.length === 0 && report.mismatched.length === 0;

  return (
    <>
      <PageHeader
        title="Storage"
        description="What Cloudflare R2 actually holds, compared with what this panel expects to be there."
        actions={
          <>
            <Button icon={<RefreshCw className="size-4" />} onClick={load} loading={loading}>
              Re-check
            </Button>
            {report && report.deletable_orphans > 0 ? (
              <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setConfirmClean(true)}>
                Clean up {report.deletable_orphans} leftover{report.deletable_orphans === 1 ? "" : "s"}
              </Button>
            ) : null}
          </>
        }
      />

      {error ? <Alert tone="danger" className="mb-5">{error}</Alert> : null}
      {!report && !error ? <Loading label="Reading the bucket…" /> : null}

      {report ? (
        <>
          <div className="bg-surface border rounded-md grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 mb-5">
            {tiles.map((t) => (
              <div key={t.label} className="px-4 py-3">
                <div className="text-[12px] text-text-muted">{t.label}</div>
                <div className="text-2xl font-semibold tabular-nums leading-tight mt-0.5">{t.value}</div>
                <div className="text-[12px] text-text-faint mt-0.5">{t.sub}</div>
              </div>
            ))}
          </div>

          <p className="text-[12.5px] text-text-faint mb-4">Checked {formatDateTime(report.checked_at)}</p>

          {report.truncated ? (
            <Alert tone="warn" className="mb-5">
              The bucket holds more objects than one report can list, so the comparison below is incomplete and cleanup is
              switched off. Remove leftovers from the Cloudflare dashboard instead.
            </Alert>
          ) : null}

          {clean ? (
            <Card>
              <EmptyState
                title="Storage is tidy"
                description="Every stored object belongs to a file in the panel, and every file has its object. Nothing to clean up."
              />
            </Card>
          ) : null}

          {report.orphans.length > 0 ? (
            <Card
              title={`Leftover objects (${report.orphans.length} · ${formatBytes(report.orphan_bytes)})`}
              padded={false}
              className="mb-5"
            >
              <div className="p-4 pb-2 text-[13px] text-text-muted">
                These were uploaded to storage but never finished saving — usually the browser lost its connection between
                the upload and the save. They belong to no file, so deleting them only frees space. Anything younger than{" "}
                {report.grace_hours} hours is left alone in case an upload is still running.
              </div>
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Storage key</th>
                      <th>Size</th>
                      <th>Age</th>
                      <th>Uploaded</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.orphans.slice(0, 200).map((o) => (
                      <tr key={o.key}>
                        <td className="font-mono text-[12px] break-all max-w-[420px]">{o.key}</td>
                        <td className="tabular-nums whitespace-nowrap">{formatBytes(o.size)}</td>
                        <td className="whitespace-nowrap">{age(o.age_hours)}</td>
                        <td className="whitespace-nowrap text-text-muted">{formatDateTime(o.last_modified)}</td>
                        <td>
                          {o.deletable ? (
                            <Badge tone="warn">will be removed</Badge>
                          ) : (
                            <Badge>too new — kept</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {report.orphans.length > 200 ? (
                <p className="px-4 py-2 border-t text-[12.5px] text-text-muted">
                  Showing the 200 largest of {report.orphans.length}. Cleanup removes every eligible one, not just these.
                </p>
              ) : null}
            </Card>
          ) : null}

          {report.missing.length > 0 ? (
            <Card title={`Broken files (${report.missing.length})`} padded={false} className="mb-5">
              <div className="p-4 pb-2 text-[13px] text-text-muted">
                The panel lists these files but their object is not in the bucket, so the public link fails. Replace each
                one with a fresh upload, or delete it from the file manager.
              </div>
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>File</th>
                      <th>Where</th>
                      <th>Recorded size</th>
                      <th>Uploaded</th>
                      <th className="text-right">Fix</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.missing.map((m) => (
                      <tr key={m.id}>
                        <td className="break-all">{m.filename}</td>
                        <td className="font-mono text-[12px] whitespace-nowrap">
                          {m.hostname ?? "?"}
                          {displayPath(m.path ?? "")}
                        </td>
                        <td className="tabular-nums whitespace-nowrap">{formatBytes(m.size)}</td>
                        <td className="whitespace-nowrap text-text-muted">{formatDateTime(m.uploaded_at)}</td>
                        <td className="text-right whitespace-nowrap">
                          <Link href="/admin/files" className="text-[13px] text-teal-700 hover:underline inline-flex items-center gap-1">
                            <ShieldCheck className="size-3.5" /> Open file manager
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}

          {report.mismatched.length > 0 ? (
            <Card title={`Size does not match (${report.mismatched.length})`} padded={false}>
              <div className="p-4 pb-2 text-[13px] text-text-muted">
                The object exists but is a different size than the panel recorded. Downloads still work; the size shown in
                lists is stale. Replacing the file corrects it.
              </div>
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>File</th>
                      <th>Where</th>
                      <th>Panel says</th>
                      <th>Storage says</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.mismatched.map((m) => (
                      <tr key={m.id}>
                        <td className="break-all">{m.filename}</td>
                        <td className="font-mono text-[12px] whitespace-nowrap">
                          {m.hostname ?? "?"}
                          {displayPath(m.path ?? "")}
                        </td>
                        <td className="tabular-nums whitespace-nowrap">{formatBytes(m.size)}</td>
                        <td className="tabular-nums whitespace-nowrap">{formatBytes(m.real_size)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
        </>
      ) : null}

      <ConfirmDialog
        open={confirmClean}
        onClose={() => setConfirmClean(false)}
        onConfirm={cleanUp}
        loading={cleaning}
        danger
        title="Delete leftover objects?"
        confirmLabel="Delete leftovers"
        message={
          <p>
            This permanently removes <strong>{report?.deletable_orphans ?? 0}</strong> object
            {report?.deletable_orphans === 1 ? "" : "s"} ({formatBytes(report?.deletable_bytes ?? 0)}) that belong to no
            file in this panel. No public link is affected. The list is rebuilt at the moment of deletion, so anything
            that became a real file in the meantime is left alone.
          </p>
        }
      />
    </>
  );
}
