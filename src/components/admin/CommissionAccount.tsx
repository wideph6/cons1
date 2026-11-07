"use client";

import { Check, HandCoins, Send, Wallet, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CommissionRatesFields, ratesText } from "@/components/admin/UsersManager";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Loading,
  PageHeader,
  errorMessage,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/client";
import {
  type CommissionAccount,
  type CommissionEntry,
  type CommissionOverviewRow,
  type CommissionRequest,
} from "@/lib/commission-shared";
import { formatMoney, parseAmount } from "@/lib/finance-shared";
import { CASE_LABELS, CASE_SYSTEMS } from "@/lib/review-shared";
import { formatDateTime } from "@/lib/utils";

/* ---------------- Pieces ---------------- */

function Tiles({ account }: { account: CommissionAccount }) {
  const { remaining, earned, reversed, paid } = account.balance;
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <div className={`border rounded-md p-3 ${remaining > 0 ? "bg-warn-50" : ""}`}>
        <div className="text-[12px] text-text-muted">Remaining (still to pay)</div>
        <div className="text-2xl font-semibold tabular-nums mt-0.5">{formatMoney(remaining)}</div>
        {account.waiting > 0 ? (
          <div className="text-[11.5px] text-text-muted">{formatMoney(account.waiting)} sent, waiting to be accepted</div>
        ) : null}
        {remaining < 0 ? <div className="text-[11.5px] text-text-muted">Paid {formatMoney(-remaining)} more than earned</div> : null}
      </div>
      <div className="border rounded-md p-3">
        <div className="text-[12px] text-text-muted">Earned</div>
        <div className="text-2xl font-semibold tabular-nums mt-0.5">{formatMoney(earned)}</div>
      </div>
      <div className="border rounded-md p-3">
        <div className="text-[12px] text-text-muted">Taken back (deleted cases)</div>
        <div className="text-2xl font-semibold tabular-nums mt-0.5">{formatMoney(reversed)}</div>
      </div>
      <div className="border rounded-md p-3">
        <div className="text-[12px] text-text-muted">Paid</div>
        <div className="text-2xl font-semibold tabular-nums mt-0.5">{formatMoney(paid)}</div>
      </div>
    </div>
  );
}

function RatesLine({ account }: { account: CommissionAccount }) {
  return (
    <p className="text-[12.5px] text-text-muted">
      Commission for each new case once approved:{" "}
      {CASE_SYSTEMS.map((s, i) => (
        <span key={s}>
          {i ? " · " : ""}
          {CASE_LABELS[s]} <b className="text-text">{formatMoney(account.rates[s])}</b>
        </span>
      ))}
      . Edits earn nothing.
    </p>
  );
}

function entryLabel(e: CommissionEntry): string {
  if (e.kind === "commission") return `Commission · ${e.system ? CASE_LABELS[e.system] : "case"}`;
  if (e.kind === "reversal") return `Taken back · ${e.system ? CASE_LABELS[e.system] : "case"} deleted`;
  return e.request_id ? "Payment (accepted)" : "Payment (recorded by the super admin)";
}

function Entries({ entries }: { entries: CommissionEntry[] }) {
  if (!entries.length) return <p className="text-sm text-text-muted">Nothing yet.</p>;
  return (
    <div className="overflow-x-auto border rounded-md max-h-[28rem] overflow-y-auto">
      <table className="tbl">
        <thead>
          <tr>
            <th>When</th>
            <th>What</th>
            <th className="text-right">Amount</th>
            <th>By</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td className="whitespace-nowrap text-[12.5px] text-text-muted">{formatDateTime(e.created_at)}</td>
              <td>
                <div>{entryLabel(e)}</div>
                {e.label ? <div className="text-[12px] text-text-muted font-mono">{e.label}</div> : null}
                {e.note ? <div className="text-[12px] text-text-muted">{e.note}</div> : null}
              </td>
              <td className={`text-right tabular-nums whitespace-nowrap font-medium ${e.amount < 0 ? "text-ok-600" : ""}`}>
                {e.amount > 0 ? "+" : ""}
                {formatMoney(e.amount)}
              </td>
              <td className="text-[12.5px] text-text-muted">{e.created_by_name ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function status(r: CommissionRequest) {
  if (r.status === "pending") return <Badge tone="warn">Waiting</Badge>;
  if (r.status === "accepted") return <Badge tone="ok">Accepted</Badge>;
  if (r.status === "rejected") return <Badge tone="danger">Turned down</Badge>;
  return <Badge>Taken back</Badge>;
}

function Payments({
  requests,
  onCancel,
  onAccept,
  onReject,
}: {
  requests: CommissionRequest[];
  onCancel?: (r: CommissionRequest) => void;
  onAccept?: (r: CommissionRequest) => void;
  onReject?: (r: CommissionRequest) => void;
}) {
  if (!requests.length) return <p className="text-sm text-text-muted">No payments sent.</p>;
  return (
    <div className="overflow-x-auto border rounded-md">
      <table className="tbl">
        <thead>
          <tr>
            <th>Sent</th>
            <th className="text-right">Amount</th>
            <th>Note</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap text-[12.5px] text-text-muted">
                {formatDateTime(r.created_at)}
                {r.created_by_name ? <div>by {r.created_by_name}</div> : null}
              </td>
              <td className="text-right tabular-nums font-medium whitespace-nowrap">{formatMoney(r.amount)}</td>
              <td className="text-[12.5px]">
                {r.note || <span className="text-text-faint">—</span>}
                {r.decision_note ? <div className="text-text-muted">Reply: {r.decision_note}</div> : null}
              </td>
              <td className="whitespace-nowrap">
                {status(r)}
                {r.decided_at ? <div className="text-[11.5px] text-text-muted">{formatDateTime(r.decided_at)}</div> : null}
              </td>
              <td className="text-right whitespace-nowrap">
                {r.status === "pending" && onAccept ? (
                  <span className="inline-flex gap-1.5">
                    <Button size="sm" variant="primary" icon={<Check className="size-3.5" />} onClick={() => onAccept(r)}>
                      Accept
                    </Button>
                    {onReject ? (
                      <Button size="sm" icon={<X className="size-3.5" />} onClick={() => onReject(r)}>
                        Turn down
                      </Button>
                    ) : null}
                  </span>
                ) : null}
                {r.status === "pending" && onCancel ? (
                  <Button size="sm" icon={<X className="size-3.5" />} onClick={() => onCancel(r)}>
                    Take back
                  </Button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- The super admin's view of one commission user ---------------- */

export function UserCommission({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [account, setAccount] = useState<CommissionAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rates, setRates] = useState(ratesText({ old_m: 0, new_m: 0, appo: 0 }));
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [confirmPay, setConfirmPay] = useState(false);
  const [cancelling, setCancelling] = useState<CommissionRequest | null>(null);
  const [busy, setBusy] = useState(false);

  const show = (a: CommissionAccount) => {
    setAccount(a);
    setRates(ratesText(a.rates));
  };

  const load = useCallback(async () => {
    try {
      show(await api<CommissionAccount>(`/api/admin/commission/users/${userId}`));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveRates() {
    setBusy(true);
    try {
      show(await api<CommissionAccount>(`/api/admin/commission/users/${userId}`, { method: "PATCH", json: { rates } }));
      toast("Saved. Cases approved from now on earn these amounts.");
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setBusy(false);
    }
  }

  async function toggleVisible(visible: boolean) {
    setBusy(true);
    try {
      await api(`/api/admin/finance/users/${userId}`, { method: "PATCH", json: { visible } });
      await load();
      toast(visible ? "The user now sees their Finance tab: payments to them wait for them to accept." : "The Finance tab is hidden from the user: you record payments yourself.");
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setBusy(false);
    }
  }

  async function pay() {
    const v = parseAmount(amount);
    if (v === null) return;
    setBusy(true);
    try {
      const r = await api<{ how: "sent" | "recorded"; account: CommissionAccount }>(`/api/admin/commission/users/${userId}/payments`, {
        json: { amount: v, note },
      });
      show(r.account);
      toast(
        r.how === "sent"
          ? `${formatMoney(v)} sent. It comes off the remaining amount once the user accepts it.`
          : `${formatMoney(v)} recorded as paid and taken off the remaining amount.`,
      );
      setAmount("");
      setNote("");
      setConfirmPay(false);
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!cancelling) return;
    setBusy(true);
    try {
      show(await api<CommissionAccount>(`/api/admin/commission/requests/${cancelling.id}`, { method: "PATCH", json: { action: "cancel" } }));
      toast("Payment taken back");
      setCancelling(null);
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setBusy(false);
    }
  }

  const v = parseAmount(amount);
  const ratesChanged = account ? CASE_SYSTEMS.some((s) => Number(rates[s] || 0) !== account.rates[s]) : false;
  const open = account ? Math.round((account.balance.remaining - account.waiting) * 100) / 100 : 0;

  return (
    <Card title="Commission account" className="mb-5">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {!account && !error ? <Loading /> : null}
      {account ? (
        <div className="space-y-4">
          <Tiles account={account} />

          <div className="space-y-2">
            <CommissionRatesFields value={rates} onChange={setRates} disabled={busy} />
            <div className="flex justify-end">
              <Button size="sm" variant="primary" disabled={!ratesChanged || busy} onClick={saveRates}>
                Save commission
              </Button>
            </div>
          </div>

          <Checkbox
            label="Show this user their Finance tab"
            description="Shown, they see what they earned and are owed, and each payment you send waits for them to accept it. Hidden, a payment you make is recorded straight away."
            checked={account.visible}
            disabled={busy}
            onChange={(e) => void toggleVisible(e.target.checked)}
          />

          <div className="rounded-md border p-3 space-y-2">
            <div className="text-[13px] font-medium inline-flex items-center gap-1.5">
              <HandCoins className="size-4" /> {account.visible ? "Send a payment" : "Record a payment made"}
              <span className="font-normal text-text-muted"> · at most {formatMoney(Math.max(0, open))} now</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_auto] items-end">
              <Field label="Amount (Rs)">
                <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field label="Note (optional)">
                <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="e.g. cash, 6 Nov" />
              </Field>
              <Button variant="primary" icon={<Send className="size-4" />} disabled={v === null || busy || v > open + 0.001} onClick={() => setConfirmPay(true)}>
                {account.visible ? "Send" : "Record"}
              </Button>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2">Payments sent</h3>
            <Payments requests={account.requests} onCancel={(r) => setCancelling(r)} />
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-2">History</h3>
            <Entries entries={account.entries} />
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmPay}
        onClose={busy ? () => undefined : () => setConfirmPay(false)}
        onConfirm={pay}
        loading={busy}
        title={account?.visible ? "Send this payment?" : "Record this payment?"}
        confirmLabel={account?.visible ? "Send" : "Record"}
        message={
          account && v !== null ? (
            account.visible ? (
              <p>
                <b>{formatMoney(v)}</b> goes to {account.user.name || account.user.email} to accept. Once they accept it, it comes off
                the remaining amount: from <b>{formatMoney(account.balance.remaining)}</b> to{" "}
                <b>{formatMoney(account.balance.remaining - v)}</b>.
              </p>
            ) : (
              <p>
                <b>{formatMoney(v)}</b> comes off the remaining amount of {account.user.name || account.user.email} now: from{" "}
                <b>{formatMoney(account.balance.remaining)}</b> to <b>{formatMoney(account.balance.remaining - v)}</b>.
              </p>
            )
          ) : null
        }
      />
      <ConfirmDialog
        open={Boolean(cancelling)}
        onClose={busy ? () => undefined : () => setCancelling(null)}
        onConfirm={cancel}
        loading={busy}
        title="Take back this payment?"
        confirmLabel="Take back"
        message={cancelling ? <p>The payment of <b>{formatMoney(cancelling.amount)}</b> waiting for the user is taken back; nothing changes in the account.</p> : null}
      />
    </Card>
  );
}

/* ---------------- A commission user's own account ---------------- */

export function MyCommission() {
  const { toast } = useToast();
  const [account, setAccount] = useState<CommissionAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<{ request: CommissionRequest; accept: boolean } | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setAccount(await api<CommissionAccount>("/api/admin/commission/me"));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide() {
    if (!deciding) return;
    setBusy(true);
    try {
      setAccount(
        await api<CommissionAccount>(`/api/admin/commission/requests/${deciding.request.id}`, {
          method: "PATCH",
          json: { action: deciding.accept ? "accept" : "reject", note: reply },
        }),
      );
      toast(deciding.accept ? "Accepted. It is taken off your remaining amount." : "Turned down");
      setDeciding(null);
      setReply("");
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setBusy(false);
    }
  }

  const waiting = account?.requests.filter((r) => r.status === "pending") ?? [];

  return (
    <>
      <PageHeader title="My commission" description="What your approved cases earned you, and the payments the super admin sends you." />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {!account && !error ? <Loading /> : null}
      {account ? (
        <div className="space-y-5">
          <Card>
            <div className="space-y-3">
              <Tiles account={account} />
              <RatesLine account={account} />
            </div>
          </Card>
          {waiting.length ? (
            <Alert tone="warn">
              {waiting.length === 1 ? "A payment waits" : `${waiting.length} payments wait`} for you. Accept it once you have the
              money; it is then taken off your remaining amount.
            </Alert>
          ) : null}
          <Card title="Payments to me">
            <Payments
              requests={account.requests}
              onAccept={(request) => setDeciding({ request, accept: true })}
              onReject={(request) => setDeciding({ request, accept: false })}
            />
          </Card>
          <Card title="History">
            <Entries entries={account.entries} />
          </Card>
        </div>
      ) : null}
      <ConfirmDialog
        open={Boolean(deciding)}
        onClose={busy ? () => undefined : () => setDeciding(null)}
        onConfirm={decide}
        loading={busy}
        danger={!deciding?.accept}
        title={deciding?.accept ? "Accept this payment?" : "Turn this payment down?"}
        confirmLabel={deciding?.accept ? "Accept" : "Turn down"}
        message={
          deciding && account ? (
            <div className="space-y-2">
              {deciding.accept ? (
                <p>
                  You received <b>{formatMoney(deciding.request.amount)}</b>. Your remaining amount goes from{" "}
                  <b>{formatMoney(account.balance.remaining)}</b> to <b>{formatMoney(account.balance.remaining - deciding.request.amount)}</b>.
                </p>
              ) : (
                <p>
                  The payment of <b>{formatMoney(deciding.request.amount)}</b> is turned down; your remaining amount stays as it is.
                </p>
              )}
              <Field label="Note (optional)">
                <Input value={reply} maxLength={300} onChange={(e) => setReply(e.target.value)} />
              </Field>
            </div>
          ) : null
        }
      />
    </>
  );
}

/* ---------------- Every commission user, for the Finance page ---------------- */

export function CommissionOverview({ rows, ready }: { rows: CommissionOverviewRow[]; ready: boolean }) {
  const total = rows.reduce((sum, u) => sum + Math.max(0, u.balance.remaining), 0);
  return (
    <Card title={`Commission users · still to pay in all ${formatMoney(total)}`} padded={false}>
      {!ready ? (
        <div className="p-4">
          <Alert tone="warn">
            Commission users need <span className="font-mono">supabase/commission.sql</span>. Run it in Supabase → SQL Editor, then reload
            this page.
          </Alert>
        </div>
      ) : rows.length === 0 ? (
        <div className="p-4">
          <EmptyState title="No commission users" description="Make one under Users → New user → Role: Commission based." />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>User</th>
                <th className="text-right">Remaining</th>
                <th className="text-right">Earned</th>
                <th className="text-right">Paid</th>
                <th>Sees Finance</th>
                <th>Sent, waiting</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="font-medium">
                      {u.name || u.email} {!u.is_active ? <Badge tone="warn">Disabled</Badge> : null}
                    </div>
                    <div className="text-[12px] text-text-muted">{u.email}</div>
                  </td>
                  <td className={`text-right tabular-nums font-semibold ${u.balance.remaining > 0 ? "text-warn-600" : ""}`}>
                    {formatMoney(u.balance.remaining)}
                  </td>
                  <td className="text-right tabular-nums">{formatMoney(u.balance.earned)}</td>
                  <td className="text-right tabular-nums">{formatMoney(u.balance.paid)}</td>
                  <td>{u.visible ? <Badge tone="ok">Yes</Badge> : <Badge>No</Badge>}</td>
                  <td>{u.waiting ? <Badge tone="warn">{formatMoney(u.waiting)}</Badge> : <span className="text-text-faint">—</span>}</td>
                  <td className="text-right">
                    <Link href={`/admin/users/${u.id}`}>
                      <Button size="sm" icon={<Wallet className="size-3.5" />}>
                        Account
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
