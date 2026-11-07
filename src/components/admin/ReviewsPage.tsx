"use client";

import { Check, ExternalLink, RefreshCw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RoleBadge } from "@/components/admin/UsersManager";
import { useSession } from "@/components/SessionProvider";
import { Alert, Badge, Button, Card, EmptyState, Field, Loading, Modal, PageHeader, Textarea, errorMessage, useToast } from "@/components/ui";
import { api } from "@/lib/client";
import { CASE_LABELS, type CaseSystem, type ReviewItem, type ReviewQueue } from "@/lib/review-shared";
import type { Role } from "@/lib/types";
import { formatDateTime, timeAgo } from "@/lib/utils";

/** Where a case's own page in the panel is, and where its waiting change is decided. */
const SYSTEM_API: Record<CaseSystem, string> = { old_m: "/api/admin/files", new_m: "/api/admin/new-m", appo: "/api/admin/appo" };

interface FileLink {
  filename: string;
  view_url: string;
}

/** Opens a case's file (an Old M file, or a document's PDF) in a new tab. */
async function openFile(item: ReviewItem) {
  const tab = window.open("", "_blank");
  try {
    const r = await api<{ url: string }>(`${SYSTEM_API[item.system]}/${item.id}/preview`);
    if (tab) tab.location.href = r.url;
    else window.location.href = r.url;
  } catch (e) {
    tab?.close();
    throw e;
  }
}

/**
 * The super admin's queue: new cases from commission users (live once approved, each earning its commission)
 * and changes to live cases (made once approved; no commission).
 */
export function ReviewsPage() {
  const { isSuper } = useSession();
  const { toast } = useToast();
  const router = useRouter();
  const [queue, setQueue] = useState<ReviewQueue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ReviewItem | null>(null);
  const [reason, setReason] = useState("");
  const [compare, setCompare] = useState<{ item: ReviewItem; current: FileLink | null; proposed: FileLink | null } | null>(null);

  const load = useCallback(async () => {
    try {
      setQueue(await api<ReviewQueue>("/api/admin/reviews"));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const key = (i: ReviewItem) => `${i.kind}:${i.system}:${i.id}`;

  async function decide(item: ReviewItem, approve: boolean, note = "") {
    setBusy(key(item));
    try {
      if (item.kind === "case") {
        await api("/api/admin/reviews", { json: { system: item.system, id: item.id, decision: approve ? "approve" : "reject", note } });
        toast(approve ? `${item.label} is live now.` : `${item.label} turned down. The user sees why.`);
      } else {
        await api(`${SYSTEM_API[item.system]}/${item.id}/pending`, { json: { decision: approve ? "approve" : "reject" } });
        toast(approve ? `The change to ${item.label} is made.` : `The change to ${item.label} is turned down.`);
      }
      setRejecting(null);
      setReason("");
      await load();
      // The sidebar's count is read by the server.
      router.refresh();
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setBusy(null);
    }
  }

  async function showCompare(item: ReviewItem) {
    setBusy(key(item));
    try {
      const r = await api<{ current: FileLink | null; proposed: FileLink | null }>(`${SYSTEM_API[item.system]}/${item.id}/pending`);
      setCompare({ item, current: r.current, proposed: r.proposed });
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setBusy(null);
    }
  }

  if (!isSuper) return <Alert tone="danger">Only the super admin reviews cases.</Alert>;

  const cases = queue?.items.filter((i) => i.kind === "case") ?? [];
  const edits = queue?.items.filter((i) => i.kind === "edit") ?? [];

  const row = (item: ReviewItem) => (
    <tr key={key(item)}>
      <td className="whitespace-nowrap">
        <Badge tone={item.system === "old_m" ? "neutral" : item.system === "new_m" ? "teal" : "info"}>{CASE_LABELS[item.system]}</Badge>
      </td>
      <td>
        <div className="font-mono text-[12.5px] break-all">{item.label || "—"}</div>
        {item.where ? <div className="text-[12px] text-text-muted break-all">{item.where}</div> : null}
        {item.changes.length ? (
          <ul className="mt-1 space-y-0.5 text-[12px]">
            {item.changes.map((c, i) => (
              <li key={i}>
                <span className="text-text-muted">{c.label}:</span> <span className="line-through text-text-faint">{c.before}</span> →{" "}
                <b>{c.after}</b>
              </li>
            ))}
          </ul>
        ) : null}
      </td>
      <td className="whitespace-nowrap">
        <div>{item.requested_by_name ?? "—"}</div>
        {item.requested_by_role ? <RoleBadge role={item.requested_by_role as Role} /> : null}
      </td>
      <td className="whitespace-nowrap text-[12.5px] text-text-muted" title={formatDateTime(item.requested_at)}>
        {timeAgo(item.requested_at)}
      </td>
      <td className="text-right whitespace-nowrap">
        <span className="inline-flex flex-wrap justify-end gap-1.5">
          {item.kind === "case" ? (
            <Button
              size="sm"
              icon={<ExternalLink className="size-3.5" />}
              disabled={busy !== null}
              onClick={() => void openFile(item).catch((e) => toast(errorMessage(e), "danger"))}
            >
              View
            </Button>
          ) : item.changes.some((c) => /file|pdf/i.test(c.label)) ? (
            <Button size="sm" icon={<ExternalLink className="size-3.5" />} disabled={busy !== null} onClick={() => void showCompare(item)}>
              Compare
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="primary"
            icon={<Check className="size-3.5" />}
            loading={busy === key(item)}
            disabled={busy !== null}
            onClick={() => void decide(item, true)}
          >
            Approve
          </Button>
          <Button
            size="sm"
            icon={<X className="size-3.5" />}
            disabled={busy !== null}
            onClick={() => (item.kind === "case" ? setRejecting(item) : void decide(item, false))}
          >
            Turn down
          </Button>
        </span>
      </td>
    </tr>
  );

  const table = (items: ReviewItem[], empty: string) =>
    items.length === 0 ? (
      <div className="p-4">
        <EmptyState title={empty} />
      </div>
    ) : (
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Kind</th>
              <th>Case</th>
              <th>By</th>
              <th>Sent</th>
              <th />
            </tr>
          </thead>
          <tbody>{items.map(row)}</tbody>
        </table>
      </div>
    );

  return (
    <>
      <PageHeader
        title="Reviews"
        description="New cases and changes waiting for you. Visitors see nothing new until you approve it; each new case from a commission user earns their commission once approved. Changes earn nothing."
        actions={
          <Button icon={<RefreshCw className="size-4" />} onClick={() => void load()}>
            Reload
          </Button>
        }
      />
      {error ? <Alert tone="danger" className="mb-4">{error}</Alert> : null}
      {!queue && !error ? <Loading /> : null}
      {queue && !queue.ready ? (
        <Alert tone="warn" className="mb-4">
          Commission users need <span className="font-mono">supabase/commission.sql</span>. Run it in Supabase → SQL Editor, then reload this
          page. Until then only changes to month-old New M and Appo documents are listed here.
        </Alert>
      ) : null}
      {queue ? (
        <div className="space-y-5">
          <Card title={`New cases waiting${cases.length ? ` (${cases.length})` : ""}`} padded={false}>
            {table(cases, "No new cases waiting")}
          </Card>
          <Card title={`Changes waiting${edits.length ? ` (${edits.length})` : ""}`} padded={false}>
            {table(edits, "No changes waiting")}
          </Card>
        </div>
      ) : null}

      <Modal
        open={Boolean(rejecting)}
        onClose={busy ? () => undefined : () => setRejecting(null)}
        title="Turn this case down?"
        footer={
          <>
            <Button onClick={() => setRejecting(null)} disabled={busy !== null}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy !== null}
              disabled={!reason.trim()}
              onClick={() => rejecting && void decide(rejecting, false, reason)}
            >
              Turn down
            </Button>
          </>
        }
      >
        {rejecting ? (
          <div className="space-y-3">
            <p className="text-[13px]">
              <span className="font-mono">{rejecting.label}</span> stays hidden from visitors and earns no commission. The user sees
              your reason, puts it right and sends it again.
            </p>
            <Field label="Reason">
              <Textarea value={reason} maxLength={500} rows={3} onChange={(e) => setReason(e.target.value)} autoFocus />
            </Field>
          </div>
        ) : null}
      </Modal>

      <Modal open={Boolean(compare)} onClose={() => setCompare(null)} title="The file now and as it would be">
        {compare ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["Now (live)", compare.current],
              ["After the change", compare.proposed],
            ].map(([title, f]) => (
              <div key={title as string} className="border rounded-md p-3">
                <div className="text-[12px] text-text-muted mb-1">{title as string}</div>
                {f ? (
                  <a href={(f as FileLink).view_url} target="_blank" rel="noreferrer" className="text-teal-700 hover:underline break-all">
                    {(f as FileLink).filename}
                  </a>
                ) : (
                  <span className="text-text-faint">—</span>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </Modal>
    </>
  );
}
