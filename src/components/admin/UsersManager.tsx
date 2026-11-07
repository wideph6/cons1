"use client";

import { KeyRound, UserPlus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/SessionProvider";
import { Alert, Badge, Button, Card, Checkbox, EmptyState, Field, Input, Loading, Modal, PageHeader, Select, errorMessage, useToast } from "@/components/ui";
import { api } from "@/lib/client";
import { formatMoney } from "@/lib/finance-shared";
import { COMMISSION_LABELS, NO_COMMISSION_RATES, type CommissionRates } from "@/lib/commission-shared";
import { ALL_PERMISSIONS, COMMISSION_PERMISSIONS, PERMISSIONS, type Permission } from "@/lib/permissions";
import { CASE_SYSTEMS } from "@/lib/review-shared";
import type { Role, UserWithCounts } from "@/lib/types";
import { formatDateTime, timeAgo } from "@/lib/utils";

export function UsersManager() {
  const { user: me } = useSession();
  const [items, setItems] = useState<UserWithCounts[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ items: UserWithCounts[] }>("/api/admin/users");
      setItems(r.items);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="Users"
        description="Admin users can only do what you allow. Commission users make cases, see only their own, and earn commission on each one you approve. Everyone's upload, replace, rename and delete counts are tracked here."
        actions={
          <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setCreateOpen(true)}>
            New user
          </Button>
        }
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {!items && !error ? <Loading /> : null}
      {items && items.length === 0 ? <EmptyState title="No users" /> : null}
      {items && items.length > 0 ? (
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th className="text-right">Uploads</th>
                  <th className="text-right">Replaces</th>
                  <th className="text-right">Renames</th>
                  <th className="text-right">Deletes</th>
                  <th className="text-right">New M</th>
                  <th className="text-right">Appo</th>
                  <th className="text-right">Total</th>
                  <th className="text-right" title="An admin: what they owe. A commission user: what is still to be paid to them.">Balance</th>
                  <th>Last sign-in</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <Link href={`/admin/users/${u.id}`} className="hover:text-teal-700">
                        <div className="font-medium">
                          {u.name || u.email} {u.id === me.id ? <span className="text-text-faint font-normal">(you)</span> : null}
                        </div>
                        <div className="text-[12px] text-text-muted">{u.email}</div>
                      </Link>
                    </td>
                    <td>
                      <RoleBadge role={u.role} />
                    </td>
                    <td>{u.is_active ? <Badge tone="ok">Active</Badge> : <Badge tone="warn">Disabled</Badge>}</td>
                    <td className="text-right tabular-nums">{u.counts.upload}</td>
                    <td className="text-right tabular-nums">{u.counts.replace}</td>
                    <td className="text-right tabular-nums">{u.counts.rename}</td>
                    <td className="text-right tabular-nums">{u.counts.delete}</td>
                    <td className="text-right tabular-nums">{u.counts.create_new_m}</td>
                    <td className="text-right tabular-nums">{u.counts.create_appo}</td>
                    <td className="text-right tabular-nums font-semibold">{u.counts.total}</td>
                    <td className="text-right tabular-nums whitespace-nowrap">
                      {u.role === "commission" ? (
                        u.owed ? (
                          <span title="Still to be paid to this commission user">{formatMoney(u.owed)} due</span>
                        ) : (
                          <span className="text-text-faint">—</span>
                        )
                      ) : u.pending ? (
                        formatMoney(u.pending)
                      ) : (
                        <span className="text-text-faint">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-text-muted" title={formatDateTime(u.last_login_at)}>
                      {u.last_login_at ? timeAgo(u.last_login_at) : "never"}
                    </td>
                    <td className="text-right">
                      <Link href={`/admin/users/${u.id}`}>
                        <Button size="sm">Manage</Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <CreateUserDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={async () => {
          setCreateOpen(false);
          await load();
        }}
      />
    </>
  );
}

/** A user's role as the panel shows it. */
export function RoleBadge({ role }: { role: Role }) {
  if (role === "superadmin") return <Badge tone="teal">Super admin</Badge>;
  if (role === "commission") return <Badge tone="info">Commission</Badge>;
  return <Badge>Admin</Badge>;
}

/** What a new commission user may do from the start: every system's making and changing of their own cases. */
export const COMMISSION_DEFAULTS: Record<string, boolean> = Object.fromEntries(COMMISSION_PERMISSIONS.map((k) => [k, true]));

/** What each approved case earns a commission user, as typed. */
export function CommissionRatesFields({
  value,
  onChange,
  disabled,
}: {
  value: Record<keyof CommissionRates, string>;
  onChange: (next: Record<keyof CommissionRates, string>) => void;
  disabled?: boolean;
}) {
  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="text-[13px] font-medium">
        Commission
        <span className="font-normal text-text-muted"> · in rupees, earned on each new case once you approve it (edits earn nothing)</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {CASE_SYSTEMS.map((s) => (
          <Field key={s} label={COMMISSION_LABELS[s]}>
            <Input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={value[s]}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, [s]: e.target.value })}
            />
          </Field>
        ))}
      </div>
    </div>
  );
}

export function ratesText(rates: CommissionRates): Record<keyof CommissionRates, string> {
  return { old_m: String(rates.old_m), new_m: String(rates.new_m), appo: String(rates.appo) };
}

export function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function PermissionGrid({
  value,
  onChange,
  disabled,
  role = "admin",
}: {
  value: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
  disabled?: boolean;
  /** A commission user is offered only making and changing their own cases. */
  role?: Role;
}) {
  const offered = role === "commission" ? PERMISSIONS.filter((p) => COMMISSION_PERMISSIONS.includes(p.key)) : [...PERMISSIONS];
  const groups = Array.from(new Set(offered.map((p) => p.group)));
  const allOn = offered.every((p) => value[p.key]);
  const everything = role === "commission" ? COMMISSION_DEFAULTS : ALL_PERMISSIONS;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium">Permissions</span>
        <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onChange(allOn ? {} : { ...everything })}>
          {allOn ? "Clear all" : "Allow everything"}
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {groups.map((g) => (
          <div key={g} className="border rounded-md p-3">
            <div className="text-[12px] text-text-muted mb-2">{g}</div>
            <div className="space-y-2">
              {offered.filter((p) => p.group === g).map((p) => (
                <Checkbox
                  key={p.key}
                  label={p.label}
                  disabled={disabled}
                  checked={Boolean(value[p.key])}
                  onChange={(e) => {
                    const next = { ...value };
                    if (e.target.checked) next[p.key as Permission] = true;
                    else delete next[p.key];
                    onChange(next);
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CreateUserDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => Promise<void> }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("admin");
  const [perms, setPerms] = useState<Record<string, boolean>>({ upload: true, replace: true, rename: true, preview: true, search: true, view_activity: true });
  const [rates, setRates] = useState(ratesText(NO_COMMISSION_RATES));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setEmail("");
      setPassword(generatePassword());
      setRole("admin");
      setPerms({ upload: true, replace: true, rename: true, preview: true, search: true, view_activity: true });
      setRates(ratesText(NO_COMMISSION_RATES));
      setError(null);
    }
  }, [open]);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/users", {
        json: { name, email, password, role, permissions: perms, ...(role === "commission" ? { commission_rates: rates } : {}) },
      });
      toast(`${name || email} created. Share the password with them securely.`);
      await onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New user"
      width="max-w-2xl"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => submit()} disabled={!name.trim() || !email.trim() || password.length < 8}>
            Create user
          </Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password" hint="At least 8 characters. Copy it now — it is not shown again.">
            <div className="flex gap-1.5">
              <Input value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" />
              <Button icon={<KeyRound className="size-4" />} onClick={() => setPassword(generatePassword())} title="Generate">
                New
              </Button>
            </div>
          </Field>
          <Field
            label="Role"
            hint={
              role === "superadmin"
                ? "Super admins can do everything, including managing users."
                : role === "commission"
                  ? "Makes cases and changes only their own. Each new case and each change waits for your approval before visitors see it."
                  : "Admins only get the permissions you tick below."
            }
          >
            <Select
              value={role}
              onChange={(e) => {
                const next = e.target.value as Role;
                setRole(next);
                if (next === "commission") setPerms({ ...COMMISSION_DEFAULTS });
              }}
            >
              <option value="admin">Admin</option>
              <option value="commission">Commission based</option>
              <option value="superadmin">Super admin</option>
            </Select>
          </Field>
        </div>
        {role !== "superadmin" ? <PermissionGrid value={perms} onChange={setPerms} role={role} /> : null}
        {role === "commission" ? <CommissionRatesFields value={rates} onChange={setRates} /> : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </form>
    </Modal>
  );
}
