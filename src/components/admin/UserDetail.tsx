"use client";

import { ArrowLeft, KeyRound, RotateCcw, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PermissionGrid, generatePassword } from "@/components/admin/UsersManager";
import { actionTone, describeActivity } from "@/components/admin/ActivityLog";
import { useSession } from "@/components/SessionProvider";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  Field,
  Input,
  Loading,
  Modal,
  PageHeader,
  Select,
  errorMessage,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/client";
import { COUNTED_ACTIONS, type Activity, type BreakdownRow, type CountedAction, type CounterRow, type Counts, type Paged, type User } from "@/lib/types";
import { ACTION_LABELS, displayPath, formatDateTime } from "@/lib/utils";

interface DetailResponse {
  item: User;
  counters: CounterRow[];
  counts: Counts;
  breakdown: BreakdownRow[];
}

const ACTION_TITLES: Record<CountedAction, string> = {
  upload: "Uploads",
  replace: "Replaces",
  rename: "Renames",
  delete: "Deletes",
};

export function UserDetail({ id }: { id: string }) {
  const { user: me } = useSession();
  const { toast } = useToast();
  const router = useRouter();

  const [data, setData] = useState<DetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<Activity[] | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "superadmin">("admin");
  const [active, setActive] = useState(true);
  const [perms, setPerms] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const [pwOpen, setPwOpen] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [counterEdit, setCounterEdit] = useState<{ action: CountedAction | "all"; mode: "set" | "reset" } | null>(null);
  const [counterValue, setCounterValue] = useState("0");
  const [delOpen, setDelOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<DetailResponse>(`/api/admin/users/${id}`);
      setData(r);
      setName(r.item.name);
      setEmail(r.item.email);
      setRole(r.item.role);
      setActive(r.item.is_active);
      setPerms(r.item.permissions ?? {});
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
    api<Paged<Activity>>(`/api/admin/activity?user_id=${id}&limit=15`).then((r) => setActivity(r.items)).catch(() => setActivity([]));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const isSelf = data?.item.id === me.id;

  async function saveProfile() {
    setSaving(true);
    try {
      await api(`/api/admin/users/${id}`, { method: "PATCH", json: { name, email, role, is_active: active, permissions: perms } });
      toast("Changes saved");
      await load();
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setSaving(false);
    }
  }

  async function savePassword() {
    setBusy(true);
    try {
      await api(`/api/admin/users/${id}`, { method: "PATCH", json: { password: newPw } });
      toast("Password changed. Share it with the user securely.");
      setPwOpen(false);
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setBusy(false);
    }
  }

  async function applyCounter() {
    if (!counterEdit) return;
    setBusy(true);
    try {
      const r = await api<{ counters: CounterRow[]; counts: Counts; breakdown: BreakdownRow[] }>(`/api/admin/users/${id}/counters`, {
        method: "PATCH",
        json: { action: counterEdit.action, mode: counterEdit.mode, value: counterEdit.mode === "set" ? Number(counterValue) : undefined },
      });
      setData((prev) => prev && { ...prev, ...r });
      toast(counterEdit.mode === "reset" ? "Counter reset to 0" : `Counter set to ${counterValue}`);
      setCounterEdit(null);
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser() {
    setBusy(true);
    try {
      await api(`/api/admin/users/${id}`, { method: "DELETE" });
      toast("User deleted");
      router.push("/admin/users");
    } catch (e) {
      toast(errorMessage(e), "danger");
      setBusy(false);
    }
  }

  // Group the breakdown: domain -> link -> counts per action.
  const grouped = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { hostname: string; domain_id: string | null; links: Map<string, { path: string; link_id: string | null; counts: Counts }> }>();
    for (const row of data.breakdown) {
      const host = row.domain_hostname ?? "(deleted domain)";
      const dom = map.get(host) ?? { hostname: host, domain_id: row.domain_id, links: new Map() };
      const pathKey = row.link_path ?? "";
      const link = dom.links.get(pathKey) ?? { path: pathKey, link_id: row.link_id, counts: { upload: 0, replace: 0, rename: 0, delete: 0, total: 0 } };
      link.counts[row.action] += Number(row.cnt);
      link.counts.total += Number(row.cnt);
      dom.links.set(pathKey, link);
      map.set(host, dom);
    }
    return Array.from(map.values()).map((d) => ({ ...d, links: Array.from(d.links.values()) }));
  }, [data]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!data) return <Loading />;
  const u = data.item;
  const countedSince = data.counters.reduce<string | null>((min, c) => (c.counted_from > "1971" && (!min || c.counted_from < min) ? c.counted_from : min), null);

  return (
    <>
      <PageHeader
        title={u.name || u.email}
        description={
          <span className="inline-flex items-center gap-2">
            {u.email} {u.role === "superadmin" ? <Badge tone="teal">Super admin</Badge> : <Badge>Admin</Badge>}
            {!u.is_active ? <Badge tone="warn">Disabled</Badge> : null}
            {isSelf ? <Badge tone="info">This is you</Badge> : null}
          </span>
        }
        actions={
          <Link href="/admin/users">
            <Button icon={<ArrowLeft className="size-4" />}>All users</Button>
          </Link>
        }
      />

      {/* Counters */}
      <Card
        title="Action counts"
        className="mb-5"
        actions={
          <Button
            size="sm"
            icon={<RotateCcw className="size-3.5" />}
            onClick={() => {
              setCounterEdit({ action: "all", mode: "reset" });
            }}
          >
            Reset all to 0
          </Button>
        }
      >
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {COUNTED_ACTIONS.map((a) => {
            const row = data.counters.find((c) => c.action === a);
            return (
              <div key={a} className="border rounded-md p-3">
                <div className="text-[12px] text-text-muted">{ACTION_TITLES[a]}</div>
                <div className="text-2xl font-semibold tabular-nums mt-0.5">{data.counts[a]}</div>
                {row && row.base > 0 ? <div className="text-[11.5px] text-text-faint">includes manual base of {row.base}</div> : null}
                <div className="flex gap-1 mt-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setCounterValue(String(data.counts[a]));
                      setCounterEdit({ action: a, mode: "set" });
                    }}
                  >
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setCounterEdit({ action: a, mode: "reset" })}>
                    Reset
                  </Button>
                </div>
              </div>
            );
          })}
          <div className="border rounded-md p-3 bg-ink-800 text-white">
            <div className="text-[12px] text-ink-300">Total</div>
            <div className="text-2xl font-semibold tabular-nums mt-0.5">{data.counts.total}</div>
            <div className="text-[11.5px] text-ink-300 mt-2">
              {countedSince ? `Counting since ${formatDateTime(countedSince)}` : "Counting since the account was created"}
            </div>
          </div>
        </div>

        <h3 className="text-sm font-semibold mt-5 mb-2">Where these actions happened</h3>
        {grouped.length === 0 ? (
          <p className="text-sm text-text-muted">No counted actions since the last reset.</p>
        ) : (
          <div className="overflow-x-auto border rounded-md">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Domain</th>
                  <th>Link</th>
                  <th className="text-right">Uploads</th>
                  <th className="text-right">Replaces</th>
                  <th className="text-right">Renames</th>
                  <th className="text-right">Deletes</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map((d) =>
                  d.links.map((l, i) => (
                    <tr key={`${d.hostname}-${l.path}`}>
                      <td className="font-medium">{i === 0 ? d.hostname : ""}</td>
                      <td className="font-mono text-[12.5px]">
                        {l.link_id ? (
                          <Link href={`/admin/files?link=${l.link_id}`} className="hover:text-teal-700">
                            {displayPath(l.path)}
                          </Link>
                        ) : (
                          <span className="text-text-muted">{displayPath(l.path)} (deleted)</span>
                        )}
                      </td>
                      <td className="text-right tabular-nums">{l.counts.upload}</td>
                      <td className="text-right tabular-nums">{l.counts.replace}</td>
                      <td className="text-right tabular-nums">{l.counts.rename}</td>
                      <td className="text-right tabular-nums">{l.counts.delete}</td>
                      <td className="text-right tabular-nums font-semibold">{l.counts.total}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        {/* Profile + permissions */}
        <Card
          title="Account & permissions"
          actions={
            <Button size="sm" variant="primary" icon={<Save className="size-3.5" />} loading={saving} onClick={saveProfile}>
              Save changes
            </Button>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 mb-4">
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Role">
              <Select value={role} onChange={(e) => setRole(e.target.value as "admin" | "superadmin")} disabled={isSelf}>
                <option value="admin">Admin</option>
                <option value="superadmin">Super admin</option>
              </Select>
            </Field>
            <div className="flex items-end pb-2">
              <Checkbox label="Account is active" description="Disabled users cannot sign in." checked={active} disabled={isSelf} onChange={(e) => setActive(e.target.checked)} />
            </div>
          </div>
          {role === "admin" ? (
            <PermissionGrid value={perms} onChange={setPerms} />
          ) : (
            <Alert tone="teal">Super admins have every permission and can manage users and counters.</Alert>
          )}
          <div className="mt-4 pt-4 border-t flex flex-wrap gap-2">
            <Button
              icon={<KeyRound className="size-4" />}
              onClick={() => {
                setNewPw(generatePassword());
                setPwOpen(true);
              }}
            >
              Set a new password
            </Button>
            {!isSelf ? (
              <Button variant="danger" onClick={() => setDelOpen(true)}>
                Delete user
              </Button>
            ) : null}
          </div>
        </Card>

        {/* Recent activity */}
        <Card
          title="Recent activity"
          padded={false}
          actions={
            <Link href={`/admin/activity?user_id=${u.id}`} className="text-[13px] text-teal-700 hover:underline">
              View all
            </Link>
          }
        >
          {!activity ? <Loading /> : null}
          {activity && activity.length === 0 ? <p className="p-4 text-sm text-text-muted">No activity yet.</p> : null}
          {activity && activity.length > 0 ? (
            <ul className="divide-y">
              {activity.map((a) => (
                <li key={a.id} className="px-4 py-2.5 text-[13px] flex gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge tone={actionTone(a.action)}>{ACTION_LABELS[a.action] ?? a.action}</Badge>
                      <span className="text-text-muted truncate text-[12.5px]">{describeActivity(a)}</span>
                    </div>
                    <div className="font-mono text-[12px] text-text-muted truncate mt-0.5">
                      {a.domain_hostname ? `${a.domain_hostname}/${a.link_path ? `${a.link_path}/` : ""}${a.filename ?? ""}` : ""}
                    </div>
                  </div>
                  <time className="text-text-faint whitespace-nowrap text-[12px]">{formatDateTime(a.created_at)}</time>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </div>

      {/* Dialogs */}
      <Modal
        open={pwOpen}
        onClose={() => setPwOpen(false)}
        title="Set a new password"
        width="max-w-md"
        footer={
          <>
            <Button onClick={() => setPwOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={savePassword} disabled={newPw.length < 8}>
              Change password
            </Button>
          </>
        }
      >
        <Field label="New password" hint="At least 8 characters. Copy it before closing.">
          <div className="flex gap-1.5">
            <Input value={newPw} onChange={(e) => setNewPw(e.target.value)} className="font-mono" />
            <Button onClick={() => setNewPw(generatePassword())}>New</Button>
          </div>
        </Field>
      </Modal>

      <Modal
        open={Boolean(counterEdit)}
        onClose={() => setCounterEdit(null)}
        title={
          counterEdit?.mode === "reset"
            ? `Reset ${counterEdit.action === "all" ? "all counters" : ACTION_TITLES[counterEdit.action].toLowerCase()} to 0?`
            : `Set ${counterEdit ? ACTION_TITLES[counterEdit.action as CountedAction].toLowerCase() : ""} count`
        }
        width="max-w-md"
        footer={
          <>
            <Button onClick={() => setCounterEdit(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={applyCounter}>
              {counterEdit?.mode === "reset" ? "Reset to 0" : "Save count"}
            </Button>
          </>
        }
      >
        {counterEdit?.mode === "set" ? (
          <Field label="New value" hint="Future actions add on top of this number.">
            <Input type="number" min={0} step={1} value={counterValue} onChange={(e) => setCounterValue(e.target.value)} autoFocus />
          </Field>
        ) : (
          <p className="text-sm">
            The count starts again from zero now. The activity history is kept — only the counter changes.
          </p>
        )}
      </Modal>

      <ConfirmDialog
        open={delOpen}
        onClose={() => setDelOpen(false)}
        onConfirm={deleteUser}
        loading={busy}
        danger
        title={`Delete ${u.name || u.email}?`}
        confirmLabel="Delete user"
        message={
          <p>
            The account is removed permanently and can no longer sign in. Their files stay online; history entries stay but show “Deleted user”.
            To keep the name on the history, disable the account instead of deleting it.
          </p>
        }
      />
    </>
  );
}
