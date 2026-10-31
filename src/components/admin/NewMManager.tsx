"use client";

import { Download, Eye, Globe, ListChecks, Pencil, Plus, QrCode, RefreshCw, Search, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { NewMDomains } from "@/components/admin/NewMDomains";
import { NewMForm } from "@/components/admin/NewMForm";
import { NewMQrDialog, QrSvgImage } from "@/components/admin/NewMQr";
import { NewMSavedValues } from "@/components/admin/NewMSavedValues";
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
import type { NewMDomain, NewMLists, NewMRecord, Paged } from "@/lib/types";
import { formatBytes, formatDateTime, formatIssued } from "@/lib/utils";

const LIMIT = 25;

export function NewMManager() {
  const { can } = useSession();
  const { toast } = useToast();

  const [page, setPage] = useState<Paged<NewMRecord> | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** New M's own domains with their links; null until loaded. */
  const [domains, setDomains] = useState<NewMDomain[] | null>(null);
  const [lists, setLists] = useState<NewMLists | null>(null);

  const [domainId, setDomainId] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<NewMRecord | null>(null);
  const [savedOpen, setSavedOpen] = useState(false);
  const [domainsOpen, setDomainsOpen] = useState(false);
  const [qrFor, setQrFor] = useState<NewMRecord | null>(null);
  const [del, setDel] = useState<NewMRecord | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<Paged<NewMRecord>>(`/api/admin/new-m${qs({ domain_id: domainId, q: search, limit: LIMIT, offset })}`);
      setPage(r);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [domainId, search, offset]);

  const loadLists = useCallback(async () => {
    try {
      setLists(await api<NewMLists>("/api/admin/new-m/lists"));
    } catch {
      // The document list shows the same failure, with the setup hint when tables are missing.
    }
  }, []);

  const loadDomains = useCallback(async () => {
    try {
      setDomains((await api<{ items: NewMDomain[] }>("/api/admin/new-m/domains")).items);
    } catch {
      // As above: the document list carries the error.
      setDomains([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadDomains();
    loadLists();
  }, [loadDomains, loadLists]);

  // A new search starts from the first page, otherwise an empty page 3 looks like "no results".
  function runSearch() {
    setOffset(0);
    setSearch(query.trim());
  }

  function clearSearch() {
    setQuery("");
    setOffset(0);
    setSearch("");
    setDomainId("");
  }

  async function openPdf(record: NewMRecord, download: boolean) {
    try {
      const r = await api<{ url: string }>(`/api/admin/new-m/${record.id}/preview${download ? "?download=1" : ""}`);
      window.open(r.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast(errorMessage(e), "danger");
    }
  }

  async function doDelete() {
    if (!del) return;
    setBusy(true);
    try {
      await api(`/api/admin/new-m/${del.id}`, { method: "DELETE" });
      toast(`${del.attestation_number} deleted`);
      const goneId = del.id;
      setDel(null);
      // Taken out of the page in place; a page left empty is reloaded so the next one moves up.
      if (page && page.items.length > 1) {
        setPage({ ...page, items: page.items.filter((r) => r.id !== goneId), total: page.total - 1 });
      } else {
        void load();
      }
      void loadDomains();
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Puts a saved document straight into the list as the server returned it, instead of reloading the
   * page. A new one goes to the top when the first, unfiltered page is showing; anywhere else the page
   * is reloaded so it lands where the search and paging say. Lists and domain counts refresh behind it.
   */
  function showSaved(item: NewMRecord, created: boolean, listsChanged: boolean) {
    if (created) {
      if (page && offset === 0 && !filtered) {
        setPage({ ...page, items: [item, ...page.items].slice(0, page.limit), total: page.total + 1 });
      } else {
        void load();
      }
      void loadDomains();
    } else if (page) {
      setPage({ ...page, items: page.items.map((r) => (r.id === item.id ? item : r)) });
      // A move to another domain or link changes the counts shown under Domains & links.
      if (editing && (editing.domain_id !== item.domain_id || editing.link_id !== item.link_id)) void loadDomains();
    }
    if (listsChanged) void loadLists();
  }

  function openForm(record: NewMRecord | null) {
    setEditing(record);
    setFormOpen(true);
  }

  const canCreate = can("new_m_create");
  const canEdit = can("new_m_edit");
  const canDelete = can("new_m_delete");
  const filtered = Boolean(search || domainId);
  const items = page?.items ?? [];
  const domainList = domains ?? [];
  // Uploading needs a domain that has at least one link to build on.
  const ready = domainList.some((d) => d.links.length > 0);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-lg font-semibold leading-tight">New M</h1>
          <p className="text-text-muted text-sm mt-1">
            Upload attestation documents one at a time. Each gets an attestation number and a complete link built from
            its domain&apos;s link, saved with its QR code. The newest upload is always at the top.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            icon={<RefreshCw className="size-4" />}
            onClick={() => {
              load();
              loadLists();
              loadDomains();
            }}
          >
            Refresh
          </Button>
          <Button icon={<Globe className="size-4" />} disabled={!domains} onClick={() => setDomainsOpen(true)}>
            Domains &amp; links
          </Button>
          <Button icon={<ListChecks className="size-4" />} disabled={!lists} onClick={() => setSavedOpen(true)}>
            Saved values
          </Button>
          {canCreate ? (
            <Button variant="primary" icon={<Upload className="size-4" />} disabled={!ready || !lists} onClick={() => openForm(null)}>
              Upload document
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      ) : null}

      {domains && !ready ? (
        <Alert tone="warn" className="mb-4">
          {domainList.length === 0 ? "New M has no domains yet." : "None of New M's domains has a link yet."} Open{" "}
          <button type="button" className="font-medium underline" onClick={() => setDomainsOpen(true)}>
            Domains &amp; links
          </button>{" "}
          to add a domain and the link documents will be built on.
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-end gap-2 mb-3">
        <div className="flex-1 min-w-[14rem]">
          <label className="block text-[12px] text-text-muted mb-1">Search all domains</label>
          <div className="flex gap-2">
            <Input
              value={query}
              placeholder="Attestation number, document type, office, authority, officer, domain, file name or date"
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
            {domainList.map((d) => (
              <option key={d.id} value={d.id}>
                {d.hostname}
              </option>
            ))}
          </Select>
        </div>
        {filtered ? <Button onClick={clearSearch}>Clear</Button> : null}
      </div>

      {!page && !error ? <Loading /> : null}

      {page && items.length === 0 ? (
        <EmptyState
          title={filtered ? "Nothing matches" : "No documents yet"}
          description={
            filtered
              ? "Try a different search term or domain."
              : "Upload the first document: pick a domain and its link, choose the PDF, and the attestation number, complete link and QR code are made for you."
          }
          action={
            canCreate && ready && !filtered ? (
              <Button variant="primary" icon={<Plus className="size-4" />} disabled={!lists} onClick={() => openForm(null)}>
                Upload document
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {page && items.length > 0 ? (
        <div className="bg-surface border rounded-md overflow-hidden">
          {filtered ? (
            <div className="px-3 py-2 border-b text-[12.5px] text-text-muted">
              {page.total} document{page.total === 1 ? "" : "s"} found
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th className="w-14">QR</th>
                  <th>Attestation number</th>
                  <th>Document type</th>
                  <th>Domain</th>
                  <th>Date</th>
                  <th>Issuing office / authority</th>
                  <th>Approving officer</th>
                  <th>PDF</th>
                  <th>Uploaded</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <button
                        type="button"
                        onClick={() => setQrFor(r)}
                        title="Show the QR code"
                        aria-label={`Show the QR code for ${r.attestation_number}`}
                        className="block rounded border hover:border-teal-600"
                      >
                        {r.qr_svg ? (
                          <QrSvgImage svg={r.qr_svg} className="size-11 rounded" />
                        ) : (
                          <span className="flex size-11 items-center justify-center text-text-faint">
                            <QrCode className="size-5" />
                          </span>
                        )}
                      </button>
                    </td>
                    <td>
                      <div className="font-mono text-[13px] font-medium whitespace-nowrap">{r.attestation_number}</div>
                      <div className="text-[11.5px] text-text-muted truncate max-w-[22rem]" title={r.verify_url}>
                        {r.verify_url}
                      </div>
                    </td>
                    <td>{r.document_type || <span className="text-text-faint">—</span>}</td>
                    <td>
                      <div className="font-mono text-[12.5px]">{r.domain_hostname}</div>
                      <div className="text-[12px] text-text-muted">
                        {r.link_id ? r.link_name || "Untitled link" : <Badge>link removed — kept as saved</Badge>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap">{formatIssued(r.issue_date)}</td>
                    <td>
                      <div>{r.issuing_office || <span className="text-text-faint">—</span>}</div>
                      <div className="text-[12px] text-text-muted">{r.issuing_authority}</div>
                    </td>
                    <td>
                      {r.officer_name ? (
                        <>
                          <div>{r.officer_name}</div>
                          <div className="text-[12px] text-text-muted">{r.officer_designation}</div>
                        </>
                      ) : (
                        <span className="text-text-faint">—</span>
                      )}
                    </td>
                    <td>
                      <div className="truncate max-w-[12rem]" title={r.doc_filename}>
                        {r.doc_filename}
                      </div>
                      <div className="text-[11.5px] text-text-muted">{formatBytes(r.doc_size)}</div>
                    </td>
                    <td className="whitespace-nowrap text-[12.5px] text-text-muted">
                      <div>{formatDateTime(r.created_at)}</div>
                      <div className="text-text-faint">{r.uploader_name || r.uploader_email || "—"}</div>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-0.5">
                        <CopyButton text={r.verify_url} label="Copy link" />
                        <IconButton label="QR code" onClick={() => setQrFor(r)}>
                          <QrCode className="size-4" />
                        </IconButton>
                        <IconButton label="Open PDF" onClick={() => openPdf(r, false)}>
                          <Eye className="size-4" />
                        </IconButton>
                        <IconButton label="Download PDF" onClick={() => openPdf(r, true)}>
                          <Download className="size-4" />
                        </IconButton>
                        {canEdit ? (
                          <IconButton label="Edit" onClick={() => openForm(r)} disabled={!lists}>
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
        <p className="text-[12.5px] text-text-muted mt-3">
          The front-end page for these links is not built yet, so opening one shows “not found” until it is.
        </p>
      ) : null}

      <NewMForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        record={editing}
        domains={domainList}
        lists={lists}
        onSaved={showSaved}
        onListsChanged={loadLists}
      />

      <NewMDomains
        open={domainsOpen}
        onClose={() => setDomainsOpen(false)}
        domains={domainList}
        canManage={can("new_m_domains")}
        onChanged={async () => {
          // A renamed domain or an edited link gives documents new links and QR codes, so the list reloads too.
          await Promise.all([loadDomains(), load()]);
        }}
      />

      <NewMQrDialog record={qrFor} onClose={() => setQrFor(null)} />

      <NewMSavedValues
        open={savedOpen}
        onClose={() => setSavedOpen(false)}
        lists={lists}
        canRemove={can("new_m_settings")}
        onChanged={loadLists}
      />

      <ConfirmDialog
        open={Boolean(del)}
        onClose={() => setDel(null)}
        onConfirm={doDelete}
        loading={busy}
        danger
        title="Delete this document?"
        confirmLabel="Delete"
        message={
          del ? (
            <>
              <span className="font-mono">{del.attestation_number}</span> and its PDF are deleted for good, and its
              verification link stops working.
            </>
          ) : null
        }
      />
    </>
  );
}
