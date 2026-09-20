"use client";

import {
  Award,
  Download,
  ExternalLink,
  Eye,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Stamp,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ApposttaCertificate } from "@/components/admin/ApposttaCertificate";
import { ApposttaForm } from "@/components/admin/ApposttaForm";
import { ApposttaSettingsForm } from "@/components/admin/ApposttaSettingsForm";
import { useSession } from "@/components/SessionProvider";
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  CopyButton,
  EmptyState,
  IconButton,
  Input,
  Loading,
  Pagination,
  Select,
  errorMessage,
  useToast,
} from "@/components/ui";
import { api, qs } from "@/lib/client";
import type { ApposttaRecord, ApposttaSettings, Domain, Paged } from "@/lib/types";
import { formatBytes, formatDateTime, formatIssued } from "@/lib/utils";

const LIMIT = 25;

export function ApposttaManager() {
  const { can } = useSession();
  const { toast } = useToast();

  const [page, setPage] = useState<Paged<ApposttaRecord> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [settings, setSettings] = useState<ApposttaSettings | null>(null);

  const [domainId, setDomainId] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ApposttaRecord | null>(null);
  const [certificate, setCertificate] = useState<ApposttaRecord | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [del, setDel] = useState<ApposttaRecord | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<Paged<ApposttaRecord>>(`/api/admin/appostta${qs({ domain_id: domainId, q: search, limit: LIMIT, offset })}`);
      setPage(r);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [domainId, search, offset]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api<{ items: Domain[] }>("/api/admin/domains")
      .then((r) => setDomains(r.items))
      .catch(() => setDomains([]));
    api<{ settings: ApposttaSettings }>("/api/admin/appostta/settings")
      .then((r) => setSettings(r.settings))
      .catch(() => setSettings(null));
  }, []);

  // A new search starts from the first page, otherwise an empty page 3 looks like "no results".
  function runSearch() {
    setOffset(0);
    setSearch(query.trim());
  }

  async function openDocument(record: ApposttaRecord, download: boolean) {
    try {
      const r = await api<{ url: string }>(`/api/admin/appostta/${record.id}/preview${download ? "?download=1" : ""}`);
      window.open(r.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast(errorMessage(e), "danger");
    }
  }

  async function doDelete() {
    if (!del) return;
    setBusy(true);
    try {
      await api(`/api/admin/appostta/${del.id}`, { method: "DELETE" });
      toast(`${del.number} deleted`);
      setDel(null);
      await load();
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setBusy(false);
    }
  }

  const canCreate = can("appostta_create");
  const canEdit = can("appostta_edit");
  const canDelete = can("appostta_delete");
  const items = page?.items ?? [];

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-lg font-semibold leading-tight">Appostta</h1>
          <p className="text-text-muted text-sm mt-1">
            Upload a document, get a reference number and a verification link on any of your domains, and download its
            certificate.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button icon={<RefreshCw className="size-4" />} onClick={load}>
            Refresh
          </Button>
          <Button icon={<Settings className="size-4" />} onClick={() => setSettingsOpen(true)}>
            Settings
          </Button>
          {canCreate ? (
            <Button
              variant="primary"
              icon={<Plus className="size-4" />}
              disabled={domains.length === 0}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              New record
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <Alert tone="danger" className="mb-4">{error}</Alert> : null}

      {domains.length === 0 ? (
        <Alert tone="warn" className="mb-4">
          No domains yet. Add one under <span className="font-medium">Domains</span> first — every verification link is
          built on a domain.
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-end gap-2 mb-3">
        <div className="w-full sm:w-56">
          <label className="block text-[12px] text-text-muted mb-1">Domain</label>
          <Select
            value={domainId}
            onChange={(e) => {
              setOffset(0);
              setDomainId(e.target.value);
            }}
          >
            <option value="">All domains</option>
            {domains.map((d) => (
              <option key={d.id} value={d.id}>
                {d.hostname}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex-1 min-w-[12rem]">
          <label className="block text-[12px] text-text-muted mb-1">Search</label>
          <div className="flex gap-2">
            <Input
              value={query}
              placeholder="Number, document name or notes"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runSearch();
              }}
            />
            <Button icon={<Search className="size-4" />} onClick={runSearch}>
              Search
            </Button>
          </div>
        </div>
      </div>

      {!page && !error ? <Loading /> : null}

      {page && items.length === 0 ? (
        <EmptyState
          title={search || domainId ? "Nothing matches" : "No records yet"}
          description={
            search || domainId
              ? "Try a different domain or search term."
              : "Create the first record: pick a domain, upload the document, and the number, link and QR code are generated for you."
          }
          action={
            canCreate && domains.length > 0 && !search && !domainId ? (
              <Button
                variant="primary"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                New record
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {page && items.length > 0 ? (
        <div className="bg-surface border rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Domain</th>
                  <th>Issued</th>
                  <th>Document</th>
                  <th className="text-right">Downloads</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="font-mono text-[13px] font-medium">{r.number}</div>
                      <div className="text-[11.5px] text-text-muted truncate max-w-[22rem]">{r.verify_url}</div>
                    </td>
                    <td>
                      <span className="font-mono text-[12.5px]">{r.domain_hostname}</span>
                      {r.domain_is_active ? null : (
                        <Badge tone="warn" className="ml-1.5">
                          disabled
                        </Badge>
                      )}
                    </td>
                    <td className="whitespace-nowrap">{formatIssued(r.issued_on)}</td>
                    <td>
                      {r.doc_filename ? (
                        <div className="min-w-0">
                          <div className="truncate max-w-[14rem]">{r.doc_filename}</div>
                          <div className="text-[11.5px] text-text-muted">{formatBytes(r.doc_size)}</div>
                        </div>
                      ) : (
                        <Badge tone="warn">no document</Badge>
                      )}
                    </td>
                    <td className="text-right tabular-nums">{r.download_count}</td>
                    <td className="whitespace-nowrap text-[12.5px] text-text-muted">{formatDateTime(r.created_at)}</td>
                    <td>
                      <div className="flex items-center justify-end gap-0.5">
                        <CopyButton text={r.verify_url} label="Copy" />
                        <IconButton label="Certificate" onClick={() => setCertificate(r)}>
                          <Stamp className="size-4" />
                        </IconButton>
                        {r.doc_r2_key ? (
                          <>
                            <IconButton label="Open document" onClick={() => openDocument(r, false)}>
                              <Eye className="size-4" />
                            </IconButton>
                            <IconButton label="Download document" onClick={() => openDocument(r, true)}>
                              <Download className="size-4" />
                            </IconButton>
                          </>
                        ) : null}
                        <a
                          href={r.verify_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text"
                          title="Open verification link"
                          aria-label="Open verification link"
                        >
                          <ExternalLink className="size-4" />
                        </a>
                        {canEdit ? (
                          <IconButton
                            label="Edit"
                            onClick={() => {
                              setEditing(r);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil className="size-4" />
                          </IconButton>
                        ) : null}
                        {canDelete ? (
                          <IconButton label="Delete" tone="danger" onClick={() => setDel(r)}>
                            <Trash2 className="size-4" />
                          </IconButton>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={page.total} limit={page.limit} offset={page.offset} onChange={setOffset} />
        </div>
      ) : null}

      {page && items.length > 0 ? (
        <p className="text-[12.5px] text-text-muted mt-3 flex items-center gap-1.5">
          <Award className="size-3.5" />
          The public verification page for these links is not built yet, so opening one returns 404 until you add it.
        </p>
      ) : null}

      <ApposttaForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        record={editing}
        domains={domains}
        settings={settings}
        onSaved={load}
      />

      <ApposttaCertificate record={certificate} settings={settings} onClose={() => setCertificate(null)} />

      <ApposttaSettingsForm
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        canEdit={can("appostta_settings")}
        onSaved={setSettings}
      />

      <ConfirmDialog
        open={Boolean(del)}
        onClose={() => setDel(null)}
        onConfirm={doDelete}
        loading={busy}
        danger
        title="Delete this record?"
        confirmLabel="Delete"
        message={
          del ? (
            <>
              <span className="font-mono">{del.number}</span> and its stored document are deleted for good, and its
              verification link stops working.
            </>
          ) : null
        }
      />
    </>
  );
}
