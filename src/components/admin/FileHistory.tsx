"use client";

import { Check, Download, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Alert, Badge, Button, Loading, Modal, Select, errorMessage, useToast } from "@/components/ui";
import { api } from "@/lib/client";
import type { PendingEditInfo } from "@/lib/pending-shared";
import { formatBytes, formatDateTime } from "@/lib/utils";

/** A file shown in a comparison, with links to show it here and to save it. */
interface ShownFile {
  filename: string;
  size: number;
  content_type: string;
  view_url: string;
  download_url: string;
}

interface PreviousFile extends ShownFile {
  id: string;
  replaced_at: string;
  delete_after: string;
  replaced_by_name: string | null;
}

/** One side of a comparison: the file shown right here in the window, with a button to save it. */
function FilePane({ title, file, meta, empty }: { title: ReactNode; file: ShownFile | null; meta?: ReactNode; empty: string }) {
  const shows = file && /pdf|image\/|text\//i.test(file.content_type);
  return (
    <div className="min-w-0 flex flex-col border rounded-md overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b bg-surface-2">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold">{title}</div>
          {file ? (
            <div className="text-[12px] text-text-muted truncate" title={file.filename}>
              {file.filename}
              {file.size ? ` · ${formatBytes(file.size)}` : ""}
            </div>
          ) : null}
          {meta ? <div className="text-[11.5px] text-text-muted">{meta}</div> : null}
        </div>
        {file ? (
          <a
            href={file.download_url}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-line-strong bg-surface text-[13px] font-medium hover:bg-surface-2"
          >
            <Download className="size-3.5" /> Download
          </a>
        ) : null}
      </div>
      {file && shows ? (
        <iframe src={file.view_url} title={`${title}: ${file.filename}`} className="w-full h-[65vh] bg-white" />
      ) : (
        <div className="flex h-40 items-center justify-center px-4 text-center text-[13px] text-text-muted">
          {file ? "This kind of file cannot be shown here. Use Download to open it." : empty}
        </div>
      )}
    </div>
  );
}

/**
 * The file a record had before it was replaced, side by side with the one visitors get now, both shown in
 * this window (no new tab, no download needed) and each with a Download button. Earlier files are kept
 * for 15 days after each replace. Super admin only.
 */
export function FileHistoryDialog({
  system,
  recordId,
  title,
  onClose,
}: {
  system: "old_m" | "new_m" | "appo";
  /** The record to show, or null when the dialog is closed. */
  recordId: string | null;
  title: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<{ label: string; current: ShownFile | null; previous: PreviousFile[]; keep_days: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState(0);

  useEffect(() => {
    setData(null);
    setError(null);
    setPick(0);
    if (!recordId) return;
    let cancelled = false;
    api<{ label: string; current: ShownFile | null; previous: PreviousFile[]; keep_days: number }>(
      `/api/admin/file-history?system=${system}&id=${recordId}`,
    )
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [system, recordId]);

  const before = data?.previous[pick] ?? null;

  return (
    <Modal open={Boolean(recordId)} onClose={onClose} title={`Earlier and current file — ${data?.label || title}`} width="max-w-7xl">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {!data && !error ? <Loading label="Loading the files…" /> : null}
      {data ? (
        <div className="space-y-3">
          <p className="text-[12.5px] text-text-muted">
            Visitors only ever get the current file. Each replaced file is kept here for {data.keep_days} days after it was replaced,
            then deleted from storage for good.
          </p>
          {data.previous.length > 1 ? (
            <label className="inline-flex items-center gap-2 text-[13px]">
              Earlier file
              <Select value={pick} onChange={(e) => setPick(Number(e.target.value))} style={{ width: "auto" }}>
                {data.previous.map((p, i) => (
                  <option key={p.id} value={i}>
                    Replaced {formatDateTime(p.replaced_at)}
                    {i === 0 ? " (the one just before the current file)" : ""}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}
          <div className="grid gap-3 lg:grid-cols-2">
            <FilePane
              title="Before"
              file={before}
              empty="No earlier file is kept for this record."
              meta={
                before ? (
                  <>
                    Replaced {formatDateTime(before.replaced_at)}
                    {before.replaced_by_name ? ` by ${before.replaced_by_name}` : ""} · deleted from storage {formatDateTime(before.delete_after)}
                  </>
                ) : null
              }
            />
            <FilePane title="Now (what visitors get)" file={data.current} empty="This record has no file now." />
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

/**
 * A change waiting for approval on a month-old New M or Appo document: each field before and after, and
 * (when it replaces the PDF) the current PDF beside the one it would become. Approve saves it; turn down
 * leaves the document as it is. Super admin only.
 */
export function PendingReviewDialog<T>({
  system,
  recordId,
  onClose,
  onDecided,
}: {
  system: "new-m" | "appo";
  recordId: string | null;
  onClose: () => void;
  /** The document as it is after the decision. */
  onDecided: (item: T, approved: boolean) => void;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<{ pending: PendingEditInfo; label: string; current: ShownFile | null; proposed: ShownFile | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    if (!recordId) return;
    let cancelled = false;
    api<{ pending: PendingEditInfo; label: string; current: ShownFile | null; proposed: ShownFile | null }>(
      `/api/admin/${system}/${recordId}/pending`,
    )
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [system, recordId]);

  async function decide(decision: "approve" | "reject") {
    if (!recordId) return;
    setBusy(decision);
    try {
      const r = await api<{ item: T }>(`/api/admin/${system}/${recordId}/pending`, { json: { decision } });
      toast(decision === "approve" ? "Approved — the change is live on the verification page now" : "Turned down — the document stays as it was");
      onDecided(r.item, decision === "approve");
      onClose();
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      open={Boolean(recordId)}
      onClose={busy ? () => undefined : onClose}
      title={`Change waiting for approval — ${data?.label ?? ""}`}
      width={data?.proposed ? "max-w-7xl" : "max-w-3xl"}
      footer={
        data ? (
          <>
            <Button variant="danger" icon={<X className="size-4" />} loading={busy === "reject"} disabled={Boolean(busy)} onClick={() => decide("reject")}>
              Turn down
            </Button>
            <Button variant="primary" icon={<Check className="size-4" />} loading={busy === "approve"} disabled={Boolean(busy)} onClick={() => decide("approve")}>
              Approve
            </Button>
          </>
        ) : null
      }
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {!data && !error ? <Loading /> : null}
      {data ? (
        <div className="space-y-3">
          <p className="text-[13px] text-text-muted">
            Asked by <b className="text-text">{data.pending.requested_by_name ?? "a deleted user"}</b> on {formatDateTime(data.pending.requested_at)}.
            The document was uploaded more than a month ago, so visitors keep seeing it as it was until you approve. Approving
            saves the change as that user; turning it down leaves the document exactly as it is.
          </p>
          <div className="overflow-x-auto border rounded-md">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Now</th>
                  <th>After the change</th>
                </tr>
              </thead>
              <tbody>
                {data.pending.summary.map((c) => (
                  <tr key={c.field}>
                    <td className="font-medium whitespace-nowrap">{c.label}</td>
                    <td className="text-text-muted">{c.before}</td>
                    <td>
                      <Badge tone="warn">{c.after}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.proposed || data.pending.new_doc ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <FilePane title="PDF now" file={data.current} empty="No PDF now." />
              <FilePane title="PDF after the change" file={data.proposed} empty="The PDF sent with this change is no longer in storage." />
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
