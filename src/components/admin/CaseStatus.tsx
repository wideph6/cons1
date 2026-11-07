"use client";

import { Check, Clock, Send, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/components/SessionProvider";
import { Badge, Button, Field, Modal, Textarea, errorMessage, useToast } from "@/components/ui";
import { api } from "@/lib/client";
import { reviewOf, type CaseSystem, type OldMPendingInfo, type ReviewStatus } from "@/lib/review-shared";

/**
 * Where a case stands, under its name in a list: waiting for the super admin (who can approve it or turn it
 * down right here) or turned down (with the reason, and for its commission user a way to send it again).
 * Nothing for a live case.
 */
export function CaseStatus({
  system,
  id,
  label,
  row,
  onChanged,
}: {
  system: CaseSystem;
  id: string;
  /** The case's name, for messages. */
  label: string;
  row: { review_status?: ReviewStatus | string | null; review_note?: string | null };
  onChanged: (status: ReviewStatus) => void;
}) {
  const { isSuper, isCommission } = useSession();
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const status = reviewOf(row as { review_status?: string | null });
  if (status === "approved") return null;

  async function send(decision: "approve" | "reject" | "resubmit", note = "") {
    setBusy(true);
    try {
      const r = await api<{ status: ReviewStatus }>("/api/admin/reviews", { json: { system, id, decision, note } });
      toast(
        decision === "approve"
          ? `${label} is live now.`
          : decision === "reject"
            ? `${label} turned down. The user sees why.`
            : `${label} sent again for approval.`,
      );
      setRejecting(false);
      setReason("");
      onChanged(r.status);
      router.refresh();
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1 space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {status === "pending" ? (
          <Badge tone="warn">
            <Clock className="size-3 mr-1" />
            Waiting for approval
          </Badge>
        ) : (
          <Badge tone="danger">Turned down</Badge>
        )}
        {isSuper && status === "pending" ? (
          <>
            <Button size="sm" variant="primary" icon={<Check className="size-3.5" />} loading={busy} onClick={() => void send("approve")}>
              Approve
            </Button>
            <Button size="sm" icon={<X className="size-3.5" />} disabled={busy} onClick={() => setRejecting(true)}>
              Turn down
            </Button>
          </>
        ) : null}
        {isCommission && status === "rejected" ? (
          <Button size="sm" icon={<Send className="size-3.5" />} loading={busy} onClick={() => void send("resubmit")}>
            Send again
          </Button>
        ) : null}
      </div>
      {status === "rejected" && row.review_note ? (
        <div className="text-[12px] text-danger-600 max-w-[22rem] whitespace-normal">Why: {row.review_note}</div>
      ) : null}
      {isCommission && status === "pending" ? (
        <div className="text-[11.5px] text-text-muted max-w-[22rem] whitespace-normal">Visitors see it once the super admin approves it.</div>
      ) : null}
      {isCommission && status === "rejected" ? (
        <div className="text-[11.5px] text-text-muted max-w-[22rem] whitespace-normal">Put it right with Edit (that sends it again), or send it again as it is.</div>
      ) : null}

      <Modal
        open={rejecting}
        onClose={busy ? () => undefined : () => setRejecting(false)}
        title="Turn this case down?"
        footer={
          <>
            <Button onClick={() => setRejecting(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} disabled={!reason.trim()} onClick={() => void send("reject", reason)}>
              Turn down
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-[13px]">
            <span className="font-mono">{label}</span> stays hidden from visitors and earns no commission. The user sees your reason,
            puts it right and sends it again.
          </p>
          <Field label="Reason">
            <Textarea value={reason} maxLength={500} rows={3} onChange={(e) => setReason(e.target.value)} autoFocus />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

/** A commission user's change to a live Old M file, waiting for the super admin. */
export function OldMChangeBadge({ change }: { change: OldMPendingInfo | null | undefined }) {
  const { isSuper } = useSession();
  if (!change) return null;
  const what = change.summary.map((c) => `${c.label}: ${c.before} → ${c.after}`).join("\n");
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      <Badge tone="warn">
        <span title={what} className="inline-flex items-center">
          <Clock className="size-3 mr-1" />
          Change waiting for approval
        </span>
      </Badge>
      {isSuper ? (
        <Link href="/admin/reviews" className="text-[12px] font-medium text-teal-700 hover:underline">
          Review
        </Link>
      ) : null}
    </div>
  );
}
