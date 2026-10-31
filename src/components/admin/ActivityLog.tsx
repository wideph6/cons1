"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/SessionProvider";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Loading, PageHeader, Pagination, Select, errorMessage } from "@/components/ui";
import { api, localToIso, qs } from "@/lib/client";
import type { Activity, Domain, Paged, User } from "@/lib/types";
import { ACTION_LABELS, formatDateTime } from "@/lib/utils";

const LIMIT = 50;

export function actionTone(action: string): "neutral" | "ok" | "warn" | "danger" | "info" | "teal" {
  if (action === "upload") return "teal";
  if (action === "replace" || action === "rename") return "info";
  if (action === "delete" || action.startsWith("delete_")) return "danger";
  if (action === "edit_counter") return "warn";
  return "neutral";
}

export function describeActivity(a: Activity): string {
  const d = a.details ?? {};
  switch (a.action) {
    case "rename":
      return d.from && d.to ? `${d.from} → ${d.to}` : "";
    case "replace":
      return d.new_size !== undefined ? `new size ${Math.round(Number(d.new_size) / 1024)} KB` : "";
    case "delete":
      return d.downloads !== undefined ? `${d.downloads} downloads before removal` : "";
    case "delete_link":
    case "delete_domain":
      return d.files !== undefined ? `${d.files} files removed` : "";
    case "create_user":
    case "update_user":
    case "delete_user":
      return String(d.target_email ?? d.email ?? "");
    case "edit_counter":
      return `${(d.actions as string[] | undefined)?.join(", ") ?? ""} → ${d.mode === "reset" ? "reset to 0" : `set to ${d.value}`} for ${d.target_email ?? ""}`;
    case "update_domain":
      if (d.vercel) return `Vercel: ${d.vercel}`;
      return d.changes ? Object.keys(d.changes as object).join(", ") : "";
    case "update_link":
      return d.previous_path !== undefined ? `was /${d.previous_path}` : "";
    default:
      return "";
  }
}

export function ActivityLog() {
  const { isSuper } = useSession();
  const router = useRouter();
  const sp = useSearchParams();

  const [users, setUsers] = useState<User[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [userId, setUserId] = useState(sp.get("user_id") ?? "");
  const [action, setAction] = useState(sp.get("action") ?? "");
  const [domainId, setDomainId] = useState(sp.get("domain_id") ?? "");
  const [from, setFrom] = useState(sp.get("from") ?? "");
  const [to, setTo] = useState(sp.get("to") ?? "");
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<Paged<Activity> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<{ items: Domain[] }>("/api/admin/domains").then((r) => setDomains(r.items)).catch(() => undefined);
    if (isSuper) api<{ items: User[] }>("/api/admin/users").then((r) => setUsers(r.items)).catch(() => undefined);
  }, [isSuper]);

  const load = useCallback(
    async (newOffset = 0) => {
      setLoading(true);
      setOffset(newOffset);
      router.replace(`/admin/activity${qs({ user_id: userId, action, domain_id: domainId, from, to, q })}`);
      try {
        setResult(
          await api<Paged<Activity>>(
            `/api/admin/activity${qs({ user_id: userId, action, domain_id: domainId, from: localToIso(from), to: localToIso(to), q, limit: LIMIT, offset: newOffset })}`,
          ),
        );
        setError(null);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    },
    [userId, action, domainId, from, to, q, router],
  );

  useEffect(() => {
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PageHeader title={isSuper ? "Activity" : "Your activity"} description="Every upload, replace, rename, delete and admin change, newest first." />

      <Card className="mb-4">
        <form
          className="grid gap-3 md:grid-cols-3 xl:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault();
            load(0);
          }}
        >
          {isSuper ? (
            <Field label="User">
              <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">Everyone</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Action">
            <Select value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">All actions</option>
              {Object.entries(ACTION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Domain">
            <Select value={domainId} onChange={(e) => setDomainId(e.target.value)}>
              <option value="">All domains</option>
              {domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.hostname}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="From">
            <Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <Input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <div className="flex items-end gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="File, path or domain" />
            <Button type="submit" variant="primary" loading={loading}>
              Filter
            </Button>
          </div>
        </form>
      </Card>

      {error ? <Alert tone="danger" className="mb-4">{error}</Alert> : null}
      {!result && !error ? <Loading /> : null}
      {result ? (
        <Card padded={false} title={`${result.total} event${result.total === 1 ? "" : "s"}`}>
          {result.items.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No activity matches" description="Try a wider date range or fewer filters." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>When</th>
                    {isSuper ? <th>User</th> : null}
                    <th>Action</th>
                    <th>Where</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((a) => (
                    <tr key={a.id}>
                      <td className="whitespace-nowrap text-text-muted">{formatDateTime(a.created_at)}</td>
                      {isSuper ? <td className="whitespace-nowrap">{a.user?.name || a.user?.email || <span className="text-text-faint">Deleted user</span>}</td> : null}
                      <td>
                        <Badge tone={actionTone(a.action)}>{ACTION_LABELS[a.action] ?? a.action}</Badge>
                      </td>
                      <td className="font-mono text-[12.5px]">
                        {a.domain_hostname ? (
                          <>
                            <span className="text-text-muted">{a.domain_hostname}</span>
                            <span className="text-text-faint">/{a.link_path ? `${a.link_path}/` : ""}</span>
                            {a.filename ? <span>{a.filename}</span> : null}
                          </>
                        ) : (
                          <span className="text-text-faint">—</span>
                        )}
                      </td>
                      <td className="text-text-muted text-[12.5px] max-w-[360px] truncate" title={describeActivity(a)}>
                        {describeActivity(a)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination total={result.total} limit={result.limit} offset={offset} onChange={(o) => load(o)} />
        </Card>
      ) : null}
    </>
  );
}
