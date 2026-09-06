"use client";

import { useState } from "react";
import { useSession } from "@/components/SessionProvider";
import { Alert, Badge, Button, Card, Field, Input, PageHeader, errorMessage, useToast } from "@/components/ui";
import { api } from "@/lib/client";
import { PERMISSIONS } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils";

export function AccountForm() {
  const { user, isSuper } = useSession();
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError("The new passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await api("/api/auth/password", { json: { current_password: current, new_password: next } });
      toast("Password changed");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const granted = PERMISSIONS.filter((p) => isSuper || user.permissions?.[p.key]);

  return (
    <>
      <PageHeader title="My account" />
      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Change password">
          <form className="space-y-3 max-w-sm" onSubmit={submit}>
            <Field label="Current password">
              <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
            </Field>
            <Field label="New password" hint="At least 8 characters.">
              <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} />
            </Field>
            <Field label="Repeat new password">
              <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </Field>
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <Button type="submit" variant="primary" loading={busy}>
              Change password
            </Button>
          </form>
        </Card>

        <Card title="Your access">
          <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm mb-4">
            <dt className="text-text-muted">Name</dt>
            <dd>{user.name || "—"}</dd>
            <dt className="text-text-muted">Email</dt>
            <dd>{user.email}</dd>
            <dt className="text-text-muted">Role</dt>
            <dd>{isSuper ? <Badge tone="teal">Super admin</Badge> : <Badge>Admin</Badge>}</dd>
            <dt className="text-text-muted">Member since</dt>
            <dd>{formatDateTime(user.created_at)}</dd>
          </dl>
          <h3 className="text-[13px] font-medium mb-1.5">What you can do</h3>
          {granted.length === 0 ? (
            <p className="text-sm text-text-muted">You can view files and links, but the super admin has not given you any editing permissions yet.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {granted.map((p) => (
                <li key={p.key}>
                  <Badge tone="teal">{p.label}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
