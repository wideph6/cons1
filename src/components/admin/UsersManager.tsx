"use client";

import { KeyRound, UserPlus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/SessionProvider";
import { Alert, Badge, Button, Card, Checkbox, EmptyState, Field, Input, Loading, Modal, PageHeader, Select, errorMessage, useToast } from "@/components/ui";
import { api } from "@/lib/client";
import { ALL_PERMISSIONS, PERMISSIONS, type Permission } from "@/lib/permissions";
import type { UserWithCounts } from "@/lib/types";
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
        description="Admin users can only do what you allow. Their upload, replace, rename and delete counts are tracked here."
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
                  <th className="text-right">Total</th>
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
                    <td>{u.role === "superadmin" ? <Badge tone="teal">Super admin</Badge> : <Badge>Admin</Badge>}</td>
                    <td>{u.is_active ? <Badge tone="ok">Active</Badge> : <Badge tone="warn">Disabled</Badge>}</td>
                    <td className="text-right tabular-nums">{u.counts.upload}</td>
                    <td className="text-right tabular-nums">{u.counts.replace}</td>
                    <td className="text-right tabular-nums">{u.counts.rename}</td>
                    <td className="text-right tabular-nums">{u.counts.delete}</td>
                    <td className="text-right tabular-nums font-semibold">{u.counts.total}</td>
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
}: {
  value: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
  disabled?: boolean;
}) {
  const groups = Array.from(new Set(PERMISSIONS.map((p) => p.group)));
  const allOn = PERMISSIONS.every((p) => value[p.key]);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium">Permissions</span>
        <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onChange(allOn ? {} : { ...ALL_PERMISSIONS })}>
          {allOn ? "Clear all" : "Allow everything"}
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {groups.map((g) => (
          <div key={g} className="border rounded-md p-3">
            <div className="text-[12px] text-text-muted mb-2">{g}</div>
            <div className="space-y-2">
              {PERMISSIONS.filter((p) => p.group === g).map((p) => (
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
  const [role, setRole] = useState<"admin" | "superadmin">("admin");
  const [perms, setPerms] = useState<Record<string, boolean>>({ upload: true, replace: true, rename: true, preview: true, search: true, view_activity: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setEmail("");
      setPassword(generatePassword());
      setRole("admin");
      setPerms({ upload: true, replace: true, rename: true, preview: true, search: true, view_activity: true });
      setError(null);
    }
  }, [open]);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/users", { json: { name, email, password, role, permissions: perms } });
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
          <Field label="Role" hint={role === "superadmin" ? "Super admins can do everything, including managing users." : "Admins only get the permissions you tick below."}>
            <Select value={role} onChange={(e) => setRole(e.target.value as "admin" | "superadmin")}>
              <option value="admin">Admin</option>
              <option value="superadmin">Super admin</option>
            </Select>
          </Field>
        </div>
        {role === "admin" ? <PermissionGrid value={perms} onChange={setPerms} /> : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </form>
    </Modal>
  );
}
