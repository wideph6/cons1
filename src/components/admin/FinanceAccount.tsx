"use client";

import { Check, HandCoins, Send, Wallet, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/SessionProvider";
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
  FINANCE_SYSTEMS,
  formatMoney,
  parseAmount,
  SYSTEM_LABELS,
  type FinanceAccount,
  type FinanceEntry,
  type FinanceOverview,
  type FinanceRates,
  type FinanceRequest,
} from "@/lib/finance-shared";
import { formatDateTime } from "@/lib/utils";

/* ---------------- Pieces ---------------- */

function BalanceTiles({ account }: { account: FinanceAccount }) {
  const { pending, paid, charged } = account.balance;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className={`border rounded-md p-3 ${pending > 0 ? "bg-warn-50" : ""}`}>
        <div className="text-[12px] text-text-muted">Pending (still to pay)</div>
        <div className="text-2xl font-semibold tabular-nums mt-0.5">{formatMoney(pending)}</div>
        {pending < 0 ? <div className="text-[11.5px] text-text-muted">Paid {formatMoney(-pending)} more than owed</div> : null}
      </div>
      <div className="border rounded-md p-3">
        <div className="text-[12px] text-text-muted">Paid</div>
        <div className="text-2xl font-semibold tabular-nums mt-0.5">{formatMoney(paid)}</div>
      </div>
      <div className="border rounded-md p-3">
        <div className="text-[12px] text-text-muted">Charged for entries</div>
        <div className="text-2xl font-semibold tabular-nums mt-0.5">{formatMoney(charged)}</div>
      </div>
    </div>
  );
}

function RatesLine({ rates }: { rates: FinanceRates }) {
  return (
    <p className="text-[12.5px] text-text-muted">
      Each new entry adds to the pending amount:{" "}
      {FINANCE_SYSTEMS.map((s, i) => (
        <span key={s}>
          {i ? " · " : ""}
          {SYSTEM_LABELS[s]} <b className="text-text">{formatMoney(rates[s])}</b>
        </span>
      ))}
    </p>
  );
}

function entryLabel(e: FinanceEntry): string {
  if (e.kind === "charge") return e.system ? `New ${SYSTEM_LABELS[e.system]}` : "New entry";
  if (e.kind === "payment") return e.request_id ? "Payment (request accepted)" : "Payment received";
  return e.note || "Count changed";
}

function EntriesTable({ entries }: { entries: FinanceEntry[] }) {
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
                {e.kind === "count_change" && e.quantity ? (
                  <div className="text-[12px] text-text-muted">
                    {e.quantity > 0 ? "+" : ""}
                    {e.quantity} × {formatMoney(e.rate)}
                  </div>
                ) : null}
                {e.kind === "payment" && e.note ? <div className="text-[12px] text-text-muted">{e.note}</div> : null}
              </td>
              <td className={`text-right tabular-nums whitespace-nowrap font-medium ${e.amount < 0 ? "text-ok-600" : ""}`}>
                {e.amount < 0 ? "−" : "+"}
                {formatMoney(Math.abs(e.amount))}
              </td>
              <td className="text-[12.5px] text-text-muted">{e.created_by_name ?? (e.kind === "charge" ? "—" : "")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function statusBadge(r: FinanceRequest) {
  if (r.status === "accepted") return <Badge tone="ok">Accepted</Badge>;
  if (r.status === "rejected") return <Badge tone="danger">Not accepted</Badge>;
  return <Badge tone="warn">Waiting</Badge>;
}

/** Payment requests; the super admin can accept or turn down the waiting ones. */
function RequestsTable({
  requests,
  showUser,
  onDecide,
}: {
  requests: FinanceRequest[];
  showUser?: boolean;
  onDecide?: (r: FinanceRequest, accept: boolean) => void;
}) {
  if (!requests.length) return <p className="text-sm text-text-muted">No payment requests.</p>;
  return (
    <div className="overflow-x-auto border rounded-md">
      <table className="tbl">
        <thead>
          <tr>
            <th>Sent</th>
            {showUser ? <th>User</th> : null}
            <th className="text-right">Amount</th>
            <th>Note</th>
            <th>Status</th>
            {onDecide ? <th /> : null}
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap text-[12.5px] text-text-muted">{formatDateTime(r.created_at)}</td>
              {showUser ? (
                <td>
                  <Link href={`/admin/users/${r.user_id}`} className="hover:text-teal-700">
                    <div className="font-medium">{r.user_name || r.user_email}</div>
                    {r.user_name ? <div className="text-[12px] text-text-muted">{r.user_email}</div> : null}
                  </Link>
                </td>
              ) : null}
              <td className="text-right tabular-nums font-medium whitespace-nowrap">{formatMoney(r.amount)}</td>
              <td className="text-[12.5px]">{r.note || <span className="text-text-faint">—</span>}</td>
              <td>
                {statusBadge(r)}
                {r.decided_at ? (
                  <div className="text-[11.5px] text-text-muted mt-0.5">
                    {formatDateTime(r.decided_at)}
                    {r.decided_by_name ? ` · ${r.decided_by_name}` : ""}
                  </div>
                ) : null}
              </td>
              {onDecide ? (
                <td className="text-right whitespace-nowrap">
                  {r.status === "pending" ? (
                    <span className="inline-flex gap-1">
                      <Button size="sm" variant="primary" icon={<Check className="size-3.5" />} onClick={() => onDecide(r, true)}>
                        Accept
                      </Button>
                      <Button size="sm" icon={<X className="size-3.5" />} onClick={() => onDecide(r, false)}>
                        Turn down
                      </Button>
                    </span>
                  ) : null}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Asks before a request is accepted or turned down, saying what it does to the user's pending amount. */
function DecideDialog({
  request,
  accept,
  pending,
  onClose,
  onDone,
}: {
  request: FinanceRequest | null;
  accept: boolean;
  /** The user's pending amount now, when known. */
  pending: number | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  async function go() {
    if (!request) return;
    setBusy(true);
    try {
      await api(`/api/admin/finance/requests/${request.id}`, { method: "PATCH", json: { accept } });
      toast(accept ? `${formatMoney(request.amount)} taken off ${request.user_name || request.user_email}'s pending amount` : "Request turned down");
      onDone();
      onClose();
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setBusy(false);
    }
  }
  return (
    <ConfirmDialog
      open={Boolean(request)}
      onClose={busy ? () => undefined : onClose}
      onConfirm={go}
      loading={busy}
      danger={!accept}
      title={accept ? "Accept this payment?" : "Turn down this request?"}
      confirmLabel={accept ? "Accept payment" : "Turn down"}
      message={
        request ? (
          accept ? (
            <p>
              Accept only once you have the money in hand. <b>{formatMoney(request.amount)}</b> comes off the pending amount of{" "}
              {request.user_name || request.user_email}
              {pending !== null ? (
                <>
                  : from <b>{formatMoney(pending)}</b> to <b>{formatMoney(pending - request.amount)}</b>
                </>
              ) : null}
              .
            </p>
          ) : (
            <p>The pending amount stays as it is. The user sees that the request was not accepted.</p>
          )
        ) : null
      }
    />
  );
}

/* ---------------- One user's account (super admin, on the user's page) ---------------- */

export function UserFinance({ userId, onChanged }: { userId: string; onChanged?: () => void }) {
  const { toast } = useToast();
  const [account, setAccount] = useState<FinanceAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [confirmPay, setConfirmPay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deciding, setDeciding] = useState<{ request: FinanceRequest; accept: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      setAccount(await api<FinanceAccount>(`/api/admin/finance/users/${userId}`));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleVisible(visible: boolean) {
    setBusy(true);
    try {
      setAccount(await api<FinanceAccount>(`/api/admin/finance/users/${userId}`, { method: "PATCH", json: { visible } }));
      toast(visible ? "The user now sees their account and can send payment requests" : "The account is hidden from the user");
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setBusy(false);
    }
  }

  async function recordPayment() {
    const v = parseAmount(amount);
    if (v === null) return;
    setBusy(true);
    try {
      setAccount(await api<FinanceAccount>(`/api/admin/finance/users/${userId}/payments`, { json: { amount: v, note } }));
      toast(`${formatMoney(v)} recorded as received`);
      setAmount("");
      setNote("");
      setConfirmPay(false);
      onChanged?.();
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setBusy(false);
    }
  }

  const paid = parseAmount(amount);

  return (
    <Card title="Finance account" className="mb-5">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {!account && !error ? <Loading /> : null}
      {account ? (
        <div className="space-y-4">
          <BalanceTiles account={account} />
          <RatesLine rates={account.rates} />
          {account.user.role === "superadmin" ? (
            <Alert tone="info">The super admin is never charged for entries.</Alert>
          ) : (
            <Checkbox
              label="Let this user see their finance account"
              description="Shown, they see their pending and paid amounts under Finance and can send a request when they pay you in cash. Hidden, you record their payments here yourself."
              checked={account.visible}
              disabled={busy}
              onChange={(e) => void toggleVisible(e.target.checked)}
            />
          )}

          <div className="rounded-md border p-3 space-y-2">
            <div className="text-[13px] font-medium inline-flex items-center gap-1.5">
              <HandCoins className="size-4" /> Record a payment received
            </div>
            <div className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_auto] items-end">
              <Field label="Amount (Rs)">
                <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field label="Note (optional)">
                <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="e.g. cash, 6 Nov" />
              </Field>
              <Button variant="primary" disabled={paid === null || busy} onClick={() => setConfirmPay(true)}>
                Record payment
              </Button>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2">Payment requests</h3>
            <RequestsTable requests={account.requests} onDecide={(request, accept) => setDeciding({ request, accept })} />
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-2">History</h3>
            <EntriesTable entries={account.entries} />
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmPay}
        onClose={busy ? () => undefined : () => setConfirmPay(false)}
        onConfirm={recordPayment}
        loading={busy}
        title="Record this payment?"
        confirmLabel="Record payment"
        message={
          account && paid !== null ? (
            <p>
              <b>{formatMoney(paid)}</b> comes off the pending amount of {account.user.name || account.user.email}: from{" "}
              <b>{formatMoney(account.balance.pending)}</b> to <b>{formatMoney(account.balance.pending - paid)}</b>.
            </p>
          ) : null
        }
      />
      <DecideDialog
        request={deciding?.request ?? null}
        accept={deciding?.accept ?? true}
        pending={account?.balance.pending ?? null}
        onClose={() => setDeciding(null)}
        onDone={() => {
          void load();
          onChanged?.();
        }}
      />
    </Card>
  );
}

/* ---------------- The Finance page ---------------- */

export function FinancePage() {
  const { isSuper } = useSession();
  return isSuper ? <FinanceOverviewPage /> : <MyFinance />;
}

/** The super admin's page: the rates, the requests waiting, and every user's balance. */
function FinanceOverviewPage() {
  const { toast } = useToast();
  const [data, setData] = useState<FinanceOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deciding, setDeciding] = useState<{ request: FinanceRequest; accept: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<FinanceOverview>("/api/admin/finance");
      setData(r);
      setRates(Object.fromEntries(FINANCE_SYSTEMS.map((s) => [s, String(r.rates[s])])));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveRates() {
    setSaving(true);
    try {
      await api("/api/admin/finance", { method: "PATCH", json: { rates } });
      toast("Saved. New entries are charged at these amounts from now on.");
      await load();
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setSaving(false);
    }
  }

  const changed = data ? FINANCE_SYSTEMS.some((s) => Number(rates[s] || 0) !== data.rates[s]) : false;
  const totalPending = data ? data.users.reduce((sum, u) => sum + Math.max(0, u.balance.pending), 0) : 0;

  return (
    <>
      <PageHeader
        title="Finance"
        description="What each admin owes for the entries they make, what they have paid, and the payments they tell you about."
      />
      {error ? <Alert tone="danger" className="mb-4">{error}</Alert> : null}
      {!data && !error ? <Loading /> : null}
      {data && !data.ready ? (
        <Alert tone="warn" className="mb-4">
          The finance tables are not in the database yet. Run <span className="font-mono">supabase/finance.sql</span> in Supabase → SQL
          Editor, then reload this page.
        </Alert>
      ) : null}
      {data ? (
        <div className="space-y-5">
          <Card
            title="Amount for each new entry"
            actions={
              <Button size="sm" variant="primary" loading={saving} disabled={!changed || !data.ready} onClick={saveRates}>
                Save amounts
              </Button>
            }
          >
            <div className="grid gap-3 sm:grid-cols-3">
              {FINANCE_SYSTEMS.map((s) => (
                <Field key={s} label={`${SYSTEM_LABELS[s]} (Rs)`}>
                  <Input type="number" min={0} step="0.01" value={rates[s] ?? ""} onChange={(e) => setRates((r) => ({ ...r, [s]: e.target.value }))} />
                </Field>
              ))}
            </div>
            <p className="text-[12.5px] text-text-muted mt-2">
              Every new Old M file upload, New M document and Appo document an admin makes adds its amount to their pending amount.
              A change applies to new entries only; entries already made keep their amount. Your own entries are never charged.
            </p>
          </Card>

          <Card title={`Payment requests waiting${data.requests.length ? ` (${data.requests.length})` : ""}`}>
            <RequestsTable requests={data.requests} showUser onDecide={(request, accept) => setDeciding({ request, accept })} />
          </Card>

          <Card title={`Users · pending in all ${formatMoney(totalPending)}`} padded={false}>
            {data.users.length === 0 ? (
              <EmptyState title="No users yet" />
            ) : (
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th className="text-right">Pending</th>
                      <th className="text-right">Paid</th>
                      <th>Sees own account</th>
                      <th>Requests waiting</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <div className="font-medium">
                            {u.name || u.email} {u.role === "superadmin" ? <Badge tone="teal">Super admin</Badge> : null}
                            {!u.is_active ? <Badge tone="warn">Disabled</Badge> : null}
                          </div>
                          <div className="text-[12px] text-text-muted">{u.email}</div>
                        </td>
                        <td className={`text-right tabular-nums font-semibold ${u.balance.pending > 0 ? "text-warn-600" : ""}`}>
                          {formatMoney(u.balance.pending)}
                        </td>
                        <td className="text-right tabular-nums">{formatMoney(u.balance.paid)}</td>
                        <td>{u.role === "superadmin" ? "—" : u.visible ? <Badge tone="ok">Yes</Badge> : <Badge>No</Badge>}</td>
                        <td>{u.pending_requests ? <Badge tone="warn">{u.pending_requests}</Badge> : <span className="text-text-faint">—</span>}</td>
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
        </div>
      ) : null}

      <DecideDialog
        request={deciding?.request ?? null}
        accept={deciding?.accept ?? true}
        pending={deciding ? (data?.users.find((u) => u.id === deciding.request.user_id)?.balance.pending ?? null) : null}
        onClose={() => setDeciding(null)}
        onDone={() => void load()}
      />
    </>
  );
}

/** An admin's own account, when the super admin lets them see it: balance, history, and payment requests. */
function MyFinance() {
  const { toast } = useToast();
  const [account, setAccount] = useState<FinanceAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setAccount(await api<FinanceAccount>("/api/admin/finance/me"));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function send() {
    const v = parseAmount(amount);
    if (v === null) return;
    setBusy(true);
    try {
      await api("/api/admin/finance/requests", { json: { amount: v, note } });
      toast("Request sent. It comes off your pending amount once the super admin accepts it.");
      setAmount("");
      setNote("");
      setConfirm(false);
      await load();
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setBusy(false);
    }
  }

  const v = parseAmount(amount);

  return (
    <>
      <PageHeader title="My finance account" description="What you owe for the entries you make, and what you have paid." />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {!account && !error ? <Loading /> : null}
      {account ? (
        <div className="space-y-5">
          <Card>
            <div className="space-y-3">
              <BalanceTiles account={account} />
              <RatesLine rates={account.rates} />
            </div>
          </Card>
          <Card title="I paid the super admin">
            <p className="text-[12.5px] text-text-muted mb-2">
              After you hand over cash, send a request for that amount. It comes off your pending amount once the super admin accepts it.
            </p>
            <div className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_auto] items-end">
              <Field label="Amount (Rs)">
                <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field label="Note (optional)">
                <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="e.g. paid in cash on 6 Nov" />
              </Field>
              <Button variant="primary" icon={<Send className="size-4" />} disabled={v === null || busy} onClick={() => setConfirm(true)}>
                Send request
              </Button>
            </div>
          </Card>
          <Card title="My payment requests">
            <RequestsTable requests={account.requests} />
          </Card>
          <Card title="History">
            <EntriesTable entries={account.entries} />
          </Card>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirm}
        onClose={busy ? () => undefined : () => setConfirm(false)}
        onConfirm={send}
        loading={busy}
        title="Send this payment request?"
        confirmLabel="Send request"
        message={v !== null ? <p>The super admin is asked to accept <b>{formatMoney(v)}</b> as paid by you.</p> : null}
      />
    </>
  );
}
