"use client";

import { CheckCircle2, ExternalLink, FolderTree, Globe, Pencil, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
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
  IconButton,
  Input,
  Loading,
  Modal,
  PageHeader,
  Textarea,
  errorMessage,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/client";
import type { Domain, VercelStatus } from "@/lib/types";
import { formatBytes, formatDateTime } from "@/lib/utils";

interface ListResponse {
  items: Domain[];
  vercel_configured: boolean;
}

export function DomainsManager() {
  const { can } = useSession();
  const { toast } = useToast();
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [edit, setEdit] = useState<Domain | null>(null);
  const [del, setDel] = useState<Domain | null>(null);
  const [delVercel, setDelVercel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const [dnsFor, setDnsFor] = useState<Domain | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<ListResponse>("/api/admin/domains"));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function checkVercel(d: Domain) {
    setChecking(d.id);
    try {
      const r = await api<{ status: VercelStatus }>(`/api/admin/domains/${d.id}/vercel`);
      setData((prev) => prev && { ...prev, items: prev.items.map((x) => (x.id === d.id ? { ...x, vercel_status: r.status } : x)) });
      if (r.status.error) toast(r.status.error, "danger");
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setChecking(null);
    }
  }

  async function vercelAction(d: Domain, action: "attach" | "verify" | "detach") {
    setChecking(d.id);
    try {
      const r = await api<{ status: VercelStatus }>(`/api/admin/domains/${d.id}/vercel${action === "verify" ? "?verify=1" : ""}`, {
        method: action === "detach" ? "DELETE" : "POST",
      });
      setData((prev) => prev && { ...prev, items: prev.items.map((x) => (x.id === d.id ? { ...x, vercel_status: r.status } : x)) });
      if (r.status.error) toast(r.status.error, "danger");
      else toast(action === "attach" ? "Domain attached to the Vercel project" : action === "verify" ? "Verification requested" : "Domain detached from Vercel");
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setChecking(null);
    }
  }

  async function toggleActive(d: Domain) {
    try {
      await api(`/api/admin/domains/${d.id}`, { method: "PATCH", json: { is_active: !d.is_active } });
      toast(d.is_active ? `${d.hostname} disabled — its links now return 404` : `${d.hostname} enabled`);
      await load();
    } catch (e) {
      toast(errorMessage(e), "danger");
    }
  }

  async function doDelete() {
    if (!del) return;
    setBusy(true);
    try {
      const r = await api<{ files_deleted: number; links_deleted: number }>(`/api/admin/domains/${del.id}${delVercel ? "?vercel=1" : ""}`, { method: "DELETE" });
      toast(`${del.hostname} deleted (${r.links_deleted} links, ${r.files_deleted} files)`);
      setDel(null);
      await load();
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Domains & subdomains"
        description="Every domain attached to this project can serve download links. Add it here, then point its DNS at Vercel."
        actions={
          <>
            <Button icon={<RefreshCw className="size-4" />} onClick={load}>
              Refresh
            </Button>
            {can("create_domain") ? (
              <Button variant="primary" icon={<Globe className="size-4" />} onClick={() => setAddOpen(true)}>
                Add domain
              </Button>
            ) : null}
          </>
        }
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {!data && !error ? <Loading /> : null}

      {data && !data.vercel_configured ? (
        <Alert tone="info" className="mb-4">
          Vercel API is not connected, so domains must also be added in Vercel by hand: Project → Settings → Domains → Add. To let this panel do it for
          you, set <span className="font-mono">VERCEL_API_TOKEN</span> and <span className="font-mono">VERCEL_PROJECT_ID</span> in the project environment.
        </Alert>
      ) : null}

      {data && data.items.length === 0 ? (
        <EmptyState
          title="No domains yet"
          description="Add the first domain or subdomain. A root link (/) is created with it so you can upload right away."
          action={can("create_domain") ? <Button variant="primary" onClick={() => setAddOpen(true)}>Add domain</Button> : undefined}
        />
      ) : null}

      {data && data.items.length > 0 ? (
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Domain</th>
                  <th>Status</th>
                  <th>Vercel</th>
                  <th>Links</th>
                  <th>Files</th>
                  <th>Added</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <Globe className="size-4 text-ink-600 shrink-0" />
                        <div className="min-w-0">
                          <div className="font-medium">{d.hostname}</div>
                          {d.notes ? <div className="text-[12px] text-text-muted truncate max-w-[320px]">{d.notes}</div> : null}
                        </div>
                      </div>
                    </td>
                    <td>
                      {d.is_active ? <Badge tone="ok">Serving</Badge> : <Badge tone="warn">Disabled</Badge>}
                    </td>
                    <td>
                      <VercelCell d={d} configured={data.vercel_configured} checking={checking === d.id} onCheck={() => checkVercel(d)} onDns={() => setDnsFor(d)} />
                    </td>
                    <td className="tabular-nums">{d.links?.length ?? "—"}</td>
                    <td className="tabular-nums whitespace-nowrap">
                      {d.file_count ?? 0} <span className="text-text-faint">· {formatBytes(d.total_size ?? 0)}</span>
                    </td>
                    <td className="whitespace-nowrap text-text-muted">{formatDateTime(d.created_at)}</td>
                    <td>
                      <div className="flex items-center justify-end gap-0.5">
                        <Link href="/admin/files" title="Open in file manager">
                          <IconButton label="Open in file manager">
                            <FolderTree className="size-3.5" />
                          </IconButton>
                        </Link>
                        {can("edit_domain") ? (
                          <IconButton label="Edit" onClick={() => setEdit(d)}>
                            <Pencil className="size-3.5" />
                          </IconButton>
                        ) : null}
                        {can("edit_domain") ? (
                          <Button size="sm" variant="ghost" onClick={() => toggleActive(d)}>
                            {d.is_active ? "Disable" : "Enable"}
                          </Button>
                        ) : null}
                        {can("delete_domain") ? (
                          <IconButton
                            label="Delete"
                            tone="danger"
                            onClick={() => {
                              setDelVercel(false);
                              setDel(d);
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </IconButton>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <DomainDialog
        open={addOpen || Boolean(edit)}
        domain={edit}
        vercelConfigured={Boolean(data?.vercel_configured)}
        onClose={() => {
          setAddOpen(false);
          setEdit(null);
        }}
        onSaved={async () => {
          setAddOpen(false);
          setEdit(null);
          await load();
        }}
      />

      <ConfirmDialog
        open={Boolean(del)}
        onClose={() => setDel(null)}
        onConfirm={doDelete}
        loading={busy}
        danger
        title={`Delete ${del?.hostname ?? ""}?`}
        confirmLabel="Delete domain"
        message={
          <div className="space-y-3">
            <p>
              This removes <strong>{del?.links?.length ?? 0}</strong> link{del?.links?.length === 1 ? "" : "s"} and <strong>{del?.file_count ?? 0}</strong> file
              {del?.file_count === 1 ? "" : "s"} from storage. Every public address on this domain stops working. This cannot be undone.
            </p>
            {data?.vercel_configured ? (
              <Checkbox label="Also detach the domain from the Vercel project" checked={delVercel} onChange={(e) => setDelVercel(e.target.checked)} />
            ) : null}
          </div>
        }
      />

      <Modal open={Boolean(dnsFor)} onClose={() => setDnsFor(null)} title={`Connect ${dnsFor?.hostname ?? ""} to Vercel`} width="max-w-xl">
        {dnsFor ? <DnsHelp d={dnsFor} configured={Boolean(data?.vercel_configured)} onAction={(a) => vercelAction(dnsFor, a)} busy={checking === dnsFor.id} /> : null}
      </Modal>
    </>
  );
}

function VercelCell({
  d,
  configured,
  checking,
  onCheck,
  onDns,
}: {
  d: Domain;
  configured: boolean;
  checking: boolean;
  onCheck: () => void;
  onDns: () => void;
}) {
  const s = d.vercel_status;
  let badge: React.ReactNode;
  if (!configured) badge = <Badge>Manual</Badge>;
  else if (!s) badge = <Badge>Not checked</Badge>;
  else if (s.error && !s.added) badge = <Badge tone="danger">Error</Badge>;
  else if (!s.added) badge = <Badge tone="warn">Not attached</Badge>;
  else if (!s.verified) badge = <Badge tone="warn">Needs verification</Badge>;
  else if (s.misconfigured) badge = <Badge tone="warn">DNS not pointing</Badge>;
  else badge = <Badge tone="ok">Ready</Badge>;

  return (
    <div className="flex items-center gap-1.5">
      {badge}
      {configured ? (
        <IconButton label="Check Vercel status" onClick={onCheck} disabled={checking}>
          <RefreshCw className={`size-3.5 ${checking ? "animate-spin" : ""}`} />
        </IconButton>
      ) : null}
      <Button size="sm" variant="ghost" onClick={onDns}>
        DNS &amp; setup
      </Button>
    </div>
  );
}

function DnsHelp({ d, configured, onAction, busy }: { d: Domain; configured: boolean; onAction: (a: "attach" | "verify" | "detach") => void; busy: boolean }) {
  const parts = d.hostname.split(".");
  const isApex = parts.length === 2;
  const s = d.vercel_status;
  return (
    <div className="space-y-4 text-sm">
      {configured ? (
        <div className="flex flex-wrap items-center gap-2">
          {!s?.added ? (
            <Button variant="primary" loading={busy} onClick={() => onAction("attach")}>
              Attach to Vercel project
            </Button>
          ) : (
            <>
              <Button loading={busy} onClick={() => onAction("verify")}>
                Re-check verification
              </Button>
              <Button variant="ghost" loading={busy} onClick={() => onAction("detach")}>
                Detach from Vercel
              </Button>
            </>
          )}
          {s ? <span className="text-text-muted text-[12.5px]">Last checked {formatDateTime(s.checked_at)}</span> : null}
        </div>
      ) : (
        <Alert tone="info">
          Add <strong>{d.hostname}</strong> in Vercel: Project → Settings → Domains → Add. If the parent domain’s DNS is already on Vercel, the subdomain
          starts working automatically.
        </Alert>
      )}

      {s?.error ? <Alert tone="danger">{s.error}</Alert> : null}

      {s?.verification && s.verification.length > 0 ? (
        <div>
          <p className="font-medium mb-1.5 flex items-center gap-1.5">
            <ShieldAlert className="size-4 text-warn-600" /> Vercel asks for this verification record
          </p>
          <div className="overflow-x-auto border rounded-md">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Name</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {s.verification.map((v, i) => (
                  <tr key={i}>
                    <td className="font-mono">{v.type}</td>
                    <td className="font-mono break-all">{v.domain}</td>
                    <td className="font-mono break-all">{v.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div>
        <p className="font-medium mb-1.5">DNS records (at your DNS provider)</p>
        <div className="overflow-x-auto border rounded-md">
          <table className="tbl">
            <thead>
              <tr>
                <th>Type</th>
                <th>Name</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {isApex ? (
                <tr>
                  <td className="font-mono">A</td>
                  <td className="font-mono">@</td>
                  <td className="font-mono">76.76.21.21</td>
                </tr>
              ) : (
                <tr>
                  <td className="font-mono">CNAME</td>
                  <td className="font-mono">{parts.slice(0, -2).join(".")}</td>
                  <td className="font-mono">cname.vercel-dns.com</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[12.5px] text-text-muted mt-1.5">
          If the domain’s nameservers are already on Vercel (bought there or transferred), skip this — Vercel manages the records for you.
        </p>
      </div>

      {s?.added && s.verified && !s.misconfigured ? (
        <p className="flex items-center gap-1.5 text-ok-600">
          <CheckCircle2 className="size-4" /> This domain is attached, verified and pointing at Vercel.
        </p>
      ) : null}

      <a
        href={`https://${d.hostname}/`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-teal-700 hover:underline text-[13px]"
      >
        <ExternalLink className="size-3.5" /> Open https://{d.hostname}
      </a>
    </div>
  );
}

function DomainDialog({
  open,
  domain,
  vercelConfigured,
  onClose,
  onSaved,
}: {
  open: boolean;
  domain: Domain | null;
  vercelConfigured: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [hostname, setHostname] = useState("");
  const [notes, setNotes] = useState("");
  const [addToVercel, setAddToVercel] = useState(true);
  const [rootLink, setRootLink] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setHostname(domain?.hostname ?? "");
      setNotes(domain?.notes ?? "");
      setAddToVercel(true);
      setRootLink(true);
      setError(null);
    }
  }, [open, domain]);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (domain) {
        await api(`/api/admin/domains/${domain.id}`, { method: "PATCH", json: { hostname, notes } });
        toast("Domain updated");
      } else {
        const r = await api<{ item: Domain }>("/api/admin/domains", {
          json: { hostname, notes, add_to_vercel: vercelConfigured && addToVercel, create_root_link: rootLink },
        });
        toast(`${r.item.hostname} added`);
        if (r.item.vercel_status?.error) toast(`Vercel: ${r.item.vercel_status.error}`, "danger");
      }
      await onSaved();
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
      title={domain ? "Edit domain" : "Add domain or subdomain"}
      width="max-w-md"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => submit()} disabled={!hostname.trim()}>
            {domain ? "Save changes" : "Add domain"}
          </Button>
        </>
      }
    >
      <form className="space-y-3" onSubmit={submit}>
        <Field label="Hostname" hint="Example: files.example.com or example.com">
          <Input value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="files.example.com" autoFocus className="font-mono" />
        </Field>
        <Field label="Notes (optional)">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-16" placeholder="What this domain is used for" />
        </Field>
        {!domain ? (
          <div className="space-y-2 pt-1">
            {vercelConfigured ? (
              <Checkbox
                label="Attach to the Vercel project now"
                description="Uses the Vercel API. If the parent domain’s DNS is on Vercel, the subdomain goes live automatically."
                checked={addToVercel}
                onChange={(e) => setAddToVercel(e.target.checked)}
              />
            ) : null}
            <Checkbox
              label="Create the root link (/) as well"
              description="Lets you serve files directly at https://hostname/file.pdf."
              checked={rootLink}
              onChange={(e) => setRootLink(e.target.checked)}
            />
          </div>
        ) : (
          <Alert tone="warn">Changing the hostname changes every public address on this domain.</Alert>
        )}
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </form>
    </Modal>
  );
}
