"use client";

import {
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  FileText,
  FolderPlus,
  Globe,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Repeat,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FilePreview } from "@/components/admin/FilePreview";
import { LinkCheck } from "@/components/admin/LinkCheck";
import { useSession } from "@/components/SessionProvider";
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  CopyButton,
  EmptyState,
  Field,
  IconButton,
  Input,
  Loading,
  Modal,
  Textarea,
  cx,
  errorMessage,
  useToast,
} from "@/components/ui";
import { api, copyText, postFormWithProgress, putWithProgress, ClientError } from "@/lib/client";
import type { Domain, FileRow, LinkRow } from "@/lib/types";
import { buildLinkUrl, buildPublicUrl, cleanFilename, displayPath, formatBytes, formatDateTime, timeAgo } from "@/lib/utils";

const SERVER_FALLBACK_LIMIT = 4 * 1024 * 1024;

type SortKey = "filename" | "size" | "uploaded_at" | "updated_at" | "download_count";

export function FileManager() {
  const { can } = useSession();
  const { toast } = useToast();
  const router = useRouter();
  const sp = useSearchParams();
  const selectedLinkId = sp.get("link");

  const [tree, setTree] = useState<Domain[] | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [treeFilter, setTreeFilter] = useState("");

  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "filename", asc: true });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [uploadOpen, setUploadOpen] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<FileRow | null>(null);
  const [renameTarget, setRenameTarget] = useState<FileRow | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<FileRow[] | null>(null);
  const [preview, setPreview] = useState<FileRow | null>(null);
  const [checkTarget, setCheckTarget] = useState<FileRow | null>(null);
  const [newLinkDomain, setNewLinkDomain] = useState<Domain | null>(null);
  const [editLink, setEditLink] = useState<LinkRow | null>(null);
  const [deleteLink, setDeleteLink] = useState<LinkRow | null>(null);
  const [busy, setBusy] = useState(false);

  const loadTree = useCallback(async () => {
    try {
      const r = await api<{ items: Domain[] }>("/api/admin/domains?include=links");
      setTree(r.items);
      setTreeError(null);
    } catch (e) {
      setTreeError(errorMessage(e));
    }
  }, []);

  const loadFiles = useCallback(async (linkId: string) => {
    try {
      const r = await api<{ items: FileRow[] }>(`/api/admin/files?link_id=${encodeURIComponent(linkId)}`);
      setFiles(r.items);
      setFilesError(null);
    } catch (e) {
      setFilesError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  useEffect(() => {
    setFiles(null);
    setSelected(new Set());
    if (selectedLinkId) loadFiles(selectedLinkId);
  }, [selectedLinkId, loadFiles]);

  const current = useMemo(() => {
    if (!tree || !selectedLinkId) return null;
    for (const d of tree) {
      const l = d.links?.find((x) => x.id === selectedLinkId);
      if (l) return { domain: d, link: l };
    }
    return null;
  }, [tree, selectedLinkId]);

  // Pick the first link automatically when nothing is selected.
  useEffect(() => {
    if (!tree || selectedLinkId) return;
    const first = tree.find((d) => d.links && d.links.length)?.links?.[0];
    if (first) router.replace(`/admin/files?link=${first.id}`);
  }, [tree, selectedLinkId, router]);

  function selectLink(id: string) {
    router.replace(`/admin/files?link=${id}`);
  }

  function toggleDomain(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function refreshAll() {
    await loadTree();
    if (selectedLinkId) await loadFiles(selectedLinkId);
  }

  const visibleFiles = useMemo(() => {
    if (!files) return [];
    const q = filter.trim().toLowerCase();
    const list = q ? files.filter((f) => f.filename.toLowerCase().includes(q)) : [...files];
    list.sort((a, b) => {
      const dir = sort.asc ? 1 : -1;
      const av = a[sort.key];
      const bv = b[sort.key];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av ?? "").localeCompare(String(bv ?? ""), undefined, { numeric: true, sensitivity: "base" }) * dir;
    });
    return list;
  }, [files, filter, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, asc: !s.asc } : { key, asc: key === "filename" }));
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allVisibleSelected = visibleFiles.length > 0 && visibleFiles.every((f) => selected.has(f.id));

  async function doRename(name: string) {
    if (!renameTarget) return;
    setBusy(true);
    try {
      await api(`/api/admin/files/${renameTarget.id}`, { method: "PATCH", json: { filename: name } });
      toast(`Renamed to ${name}`);
      setRenameTarget(null);
      await refreshAll();
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!deleteTargets?.length) return;
    setBusy(true);
    let failed = 0;
    for (const f of deleteTargets) {
      try {
        await api(`/api/admin/files/${f.id}`, { method: "DELETE" });
      } catch {
        failed++;
      }
    }
    setBusy(false);
    setDeleteTargets(null);
    setSelected(new Set());
    toast(
      failed ? `Deleted ${deleteTargets.length - failed}, ${failed} failed` : `Deleted ${deleteTargets.length} file${deleteTargets.length > 1 ? "s" : ""}`,
      failed ? "danger" : "ok",
    );
    await refreshAll();
  }

  async function doCreateLink(domainId: string, path: string, notes: string) {
    setBusy(true);
    try {
      const r = await api<{ item: LinkRow }>("/api/admin/links", { json: { domain_id: domainId, path, notes } });
      toast(`Link ${displayPath(r.item.path)} created`);
      setNewLinkDomain(null);
      await loadTree();
      selectLink(r.item.id);
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setBusy(false);
    }
  }

  async function doEditLink(path: string, notes: string) {
    if (!editLink) return;
    setBusy(true);
    try {
      await api(`/api/admin/links/${editLink.id}`, { method: "PATCH", json: { path, notes } });
      toast("Link updated");
      setEditLink(null);
      await refreshAll();
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setBusy(false);
    }
  }

  async function doDeleteLink() {
    if (!deleteLink) return;
    setBusy(true);
    try {
      await api(`/api/admin/links/${deleteLink.id}`, { method: "DELETE" });
      toast(`Link ${displayPath(deleteLink.path)} deleted`);
      setDeleteLink(null);
      if (selectedLinkId === deleteLink.id) router.replace("/admin/files");
      await loadTree();
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setBusy(false);
    }
  }

  const filteredTree = useMemo(() => {
    if (!tree) return [];
    const q = treeFilter.trim().toLowerCase();
    if (!q) return tree;
    return tree
      .map((d): Domain | null => {
        const hostMatch = d.hostname.includes(q);
        const links = (d.links ?? []).filter((l) => hostMatch || displayPath(l.path).toLowerCase().includes(q));
        return hostMatch || links.length ? { ...d, links } : null;
      })
      .filter((d): d is Domain => d !== null);
  }, [tree, treeFilter]);

  const baseUrl = current ? buildLinkUrl(current.domain.hostname, current.link.path) : "";

  return (
    <div className="grid gap-4 lg:grid-cols-[290px_minmax(0,1fr)] items-start">
      {/* ---------- Tree ---------- */}
      <aside className="bg-surface border rounded-md lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] flex flex-col">
        <div className="flex items-center gap-2 px-3 h-11 border-b">
          <h2 className="text-sm font-semibold flex-1">Domains &amp; links</h2>
          <IconButton label="Refresh" onClick={refreshAll}>
            <RefreshCw className="size-3.5" />
          </IconButton>
        </div>
        <div className="p-2 border-b">
          <Input placeholder="Filter domains or links" value={treeFilter} onChange={(e) => setTreeFilter(e.target.value)} className="!py-1.5 text-[13px]" />
        </div>
        <div className="overflow-y-auto p-2 flex-1 min-h-[200px]">
          {treeError ? <Alert tone="danger">{treeError}</Alert> : null}
          {!tree && !treeError ? <Loading /> : null}
          {tree && tree.length === 0 ? (
            <div className="p-2 text-[13px] text-text-muted">
              No domains yet.{" "}
              {can("create_domain") ? (
                <Link href="/admin/domains" className="text-teal-700 hover:underline">
                  Add your first domain
                </Link>
              ) : (
                "Ask the super admin to add one."
              )}
            </div>
          ) : null}
          {filteredTree.map((d) => {
            const open = !collapsed.has(d.id);
            return (
              <div key={d.id} className="mb-1">
                <div className="flex items-center group">
                  <button className="tree-row flex-1 min-w-0" onClick={() => toggleDomain(d.id)}>
                    {open ? <ChevronDown className="size-3.5 text-text-faint shrink-0" /> : <ChevronRight className="size-3.5 text-text-faint shrink-0" />}
                    <Globe className="size-3.5 text-ink-600 shrink-0" />
                    <span className="truncate font-medium">{d.hostname}</span>
                    {!d.is_active ? <Badge tone="warn">off</Badge> : null}
                  </button>
                  {can("create_link") ? (
                    <IconButton label={`New link on ${d.hostname}`} onClick={() => setNewLinkDomain(d)} className="opacity-0 group-hover:opacity-100 focus:opacity-100">
                      <Plus className="size-3.5" />
                    </IconButton>
                  ) : null}
                </div>
                {open ? (
                  <div className="ml-4 border-l pl-1.5 mt-0.5 space-y-0.5">
                    {(d.links ?? []).length === 0 ? (
                      <div className="px-2 py-1 text-[12.5px] text-text-faint">No links yet</div>
                    ) : null}
                    {(d.links ?? []).map((l) => (
                      <button
                        key={l.id}
                        className={cx("tree-row", selectedLinkId === l.id && "is-active")}
                        onClick={() => selectLink(l.id)}
                        title={buildLinkUrl(d.hostname, l.path)}
                      >
                        <Link2 className="size-3.5 shrink-0 text-text-faint" />
                        <span className="truncate font-mono text-[12.5px]">{displayPath(l.path)}</span>
                        <span className="ml-auto text-[11.5px] text-text-faint tabular-nums">{l.file_count}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </aside>

      {/* ---------- Files ---------- */}
      <section className="bg-surface border rounded-md min-w-0">
        {!current ? (
          <div className="p-6">
            {tree && tree.length > 0 && !selectedLinkId ? (
              <EmptyState
                title="Choose a link"
                description="Pick a link from the left to see and manage its files, or create a new link under a domain."
              />
            ) : selectedLinkId && tree ? (
              <EmptyState title="Link not found" description="It may have been deleted. Pick another link from the left." />
            ) : (
              <Loading />
            )}
          </div>
        ) : (
          <>
            <div className="px-4 pt-4 pb-3 border-b">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-[12.5px] text-text-muted flex items-center gap-1.5">
                    <Globe className="size-3.5" /> {current.domain.hostname}
                    {!current.domain.is_active ? <Badge tone="warn">Domain disabled — public links return 404</Badge> : null}
                  </div>
                  <h1 className="text-lg font-semibold font-mono leading-tight mt-0.5">{displayPath(current.link.path)}</h1>
                  {current.link.notes ? <p className="text-[13px] text-text-muted mt-1">{current.link.notes}</p> : null}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {can("edit_link") ? (
                    <Button size="sm" icon={<Pencil className="size-3.5" />} onClick={() => setEditLink(current.link)}>
                      Edit link
                    </Button>
                  ) : null}
                  {can("delete_link") ? (
                    <Button size="sm" variant="danger" icon={<Trash2 className="size-3.5" />} onClick={() => setDeleteLink(current.link)}>
                      Delete link
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <p className="address flex-1" title="Public address for files in this link">
                  <span className="host">https://{current.domain.hostname}</span>
                  <span className="dim">/</span>
                  {current.link.path ? (
                    <>
                      {current.link.path}
                      <span className="dim">/</span>
                    </>
                  ) : null}
                  <span className="dim">‹file-name.pdf›</span>
                </p>
                <CopyButton text={baseUrl} label="Copy base URL" size="md" />
              </div>
            </div>

            <div className="flex items-center gap-2 px-4 py-2.5 border-b flex-wrap">
              {can("upload") ? (
                <Button variant="primary" size="sm" icon={<Upload className="size-3.5" />} onClick={() => setUploadOpen(true)}>
                  Upload files
                </Button>
              ) : null}
              {selected.size > 0 && can("delete") ? (
                <Button
                  size="sm"
                  variant="danger"
                  icon={<Trash2 className="size-3.5" />}
                  onClick={() => setDeleteTargets(visibleFiles.filter((f) => selected.has(f.id)))}
                >
                  Delete selected ({selected.size})
                </Button>
              ) : null}
              <div className="ml-auto flex items-center gap-2">
                <span className="text-[12.5px] text-text-muted whitespace-nowrap">
                  {files ? `${files.length} file${files.length === 1 ? "" : "s"} · ${formatBytes(current.link.total_size)}` : ""}
                </span>
                <Input placeholder="Filter by name" value={filter} onChange={(e) => setFilter(e.target.value)} className="!w-52 !py-1.5 text-[13px]" />
              </div>
            </div>

            {filesError ? (
              <div className="p-4">
                <Alert tone="danger">{filesError}</Alert>
              </div>
            ) : null}
            {!files && !filesError ? <Loading label="Loading files…" /> : null}
            {files && files.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="This link has no files"
                  description={`Upload a PDF and it will be available at ${baseUrl}‹file-name›.pdf`}
                  action={
                    can("upload") ? (
                      <Button variant="primary" icon={<Upload className="size-4" />} onClick={() => setUploadOpen(true)}>
                        Upload files
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            ) : null}
            {files && files.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th className="w-8">
                        <input
                          type="checkbox"
                          className="accent-teal-600"
                          aria-label="Select all"
                          checked={allVisibleSelected}
                          onChange={() => setSelected(allVisibleSelected ? new Set() : new Set(visibleFiles.map((f) => f.id)))}
                        />
                      </th>
                      <SortTh label="Name" k="filename" sort={sort} onClick={toggleSort} />
                      <SortTh label="Size" k="size" sort={sort} onClick={toggleSort} />
                      <SortTh label="Uploaded" k="uploaded_at" sort={sort} onClick={toggleSort} />
                      <SortTh label="Last change" k="updated_at" sort={sort} onClick={toggleSort} />
                      <SortTh label="Downloads" k="download_count" sort={sort} onClick={toggleSort} />
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleFiles.map((f) => {
                      const url = buildPublicUrl(current.domain.hostname, current.link.path, f.filename);
                      return (
                        <tr key={f.id} className={cx(selected.has(f.id) && "is-selected")}>
                          <td>
                            <input type="checkbox" className="accent-teal-600" checked={selected.has(f.id)} onChange={() => toggleSelect(f.id)} aria-label={`Select ${f.filename}`} />
                          </td>
                          <td>
                            <button
                              className="inline-flex items-center gap-2 text-left hover:text-teal-700 disabled:hover:text-inherit max-w-[420px]"
                              onClick={() => setPreview(f)}
                              disabled={!can("preview")}
                              title={can("preview") ? "Preview" : undefined}
                            >
                              <FileText className="size-4 text-text-faint shrink-0" />
                              <span className="truncate">{f.filename}</span>
                            </button>
                          </td>
                          <td className="tabular-nums whitespace-nowrap">{formatBytes(f.size)}</td>
                          <td className="whitespace-nowrap">
                            <div title={formatDateTime(f.uploaded_at)}>{formatDateTime(f.uploaded_at)}</div>
                            <div className="text-[12px] text-text-faint">{f.uploader?.name || f.uploader?.email || "—"}</div>
                          </td>
                          <td className="whitespace-nowrap text-text-muted">
                            {f.replaced_at || f.renamed_at ? (
                              <div className="flex items-center gap-1.5">
                                <span title={formatDateTime(f.updated_at)}>{timeAgo(f.updated_at)}</span>
                                {f.replaced_at && new Date(f.replaced_at) >= new Date(f.renamed_at ?? 0) ? <Badge>replaced</Badge> : <Badge>renamed</Badge>}
                              </div>
                            ) : (
                              <span className="text-text-faint">—</span>
                            )}
                          </td>
                          <td className="tabular-nums">{f.download_count}</td>
                          <td>
                            <div className="flex items-center justify-end gap-0.5">
                              <IconButton
                                label="Copy public link"
                                onClick={async () => {
                                  if (await copyText(url)) toast("Link copied");
                                }}
                              >
                                <Copy className="size-3.5" />
                              </IconButton>
                              <IconButton label="Check public link" onClick={() => setCheckTarget(f)}>
                                <ShieldCheck className="size-3.5" />
                              </IconButton>
                              {can("preview") ? (
                                <IconButton label="Preview" onClick={() => setPreview(f)}>
                                  <Eye className="size-3.5" />
                                </IconButton>
                              ) : null}
                              {can("rename") ? (
                                <IconButton label="Rename" onClick={() => setRenameTarget(f)}>
                                  <Pencil className="size-3.5" />
                                </IconButton>
                              ) : null}
                              {can("replace") ? (
                                <IconButton label="Replace file" onClick={() => setReplaceTarget(f)}>
                                  <Repeat className="size-3.5" />
                                </IconButton>
                              ) : null}
                              {can("delete") ? (
                                <IconButton label="Delete" tone="danger" onClick={() => setDeleteTargets([f])}>
                                  <Trash2 className="size-3.5" />
                                </IconButton>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {visibleFiles.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center text-text-muted py-6">
                          No files match “{filter}”.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        )}
      </section>

      {/* ---------- Dialogs ---------- */}
      {current ? (
        <UploadDialog
          open={uploadOpen || Boolean(replaceTarget)}
          onClose={() => {
            setUploadOpen(false);
            setReplaceTarget(null);
          }}
          linkId={current.link.id}
          baseUrl={baseUrl}
          replaceTarget={replaceTarget}
          existing={files ?? []}
          canReplace={can("replace")}
          onChanged={refreshAll}
        />
      ) : null}

      <RenameDialog file={renameTarget} onClose={() => setRenameTarget(null)} onSubmit={doRename} busy={busy} />

      <ConfirmDialog
        open={Boolean(deleteTargets)}
        onClose={() => setDeleteTargets(null)}
        onConfirm={doDelete}
        loading={busy}
        danger
        title={deleteTargets && deleteTargets.length > 1 ? `Delete ${deleteTargets.length} files?` : "Delete this file?"}
        confirmLabel="Delete"
        message={
          <>
            <p>The public link{deleteTargets && deleteTargets.length > 1 ? "s" : ""} will stop working immediately. This cannot be undone.</p>
            <ul className="mt-2 max-h-40 overflow-auto font-mono text-[12.5px] text-text-muted space-y-0.5">
              {deleteTargets?.map((f) => <li key={f.id}>{f.filename}</li>)}
            </ul>
          </>
        }
      />

      <LinkDialog
        open={Boolean(newLinkDomain) || Boolean(editLink)}
        domain={newLinkDomain ?? current?.domain ?? null}
        link={editLink}
        busy={busy}
        onClose={() => {
          setNewLinkDomain(null);
          setEditLink(null);
        }}
        onSubmit={(path, notes) => (editLink ? doEditLink(path, notes) : newLinkDomain ? doCreateLink(newLinkDomain.id, path, notes) : undefined)}
      />

      <ConfirmDialog
        open={Boolean(deleteLink)}
        onClose={() => setDeleteLink(null)}
        onConfirm={doDeleteLink}
        loading={busy}
        danger
        title={`Delete link ${deleteLink ? displayPath(deleteLink.path) : ""}?`}
        confirmLabel="Delete link and files"
        message={
          <p>
            This removes the link and <strong>{deleteLink?.file_count ?? 0}</strong> file{deleteLink?.file_count === 1 ? "" : "s"} stored under it. Every public address under this
            link stops working. This cannot be undone.
          </p>
        }
      />

      <FilePreview file={preview} onClose={() => setPreview(null)} />
      <LinkCheck file={checkTarget} onClose={() => setCheckTarget(null)} />
    </div>
  );
}

function SortTh({ label, k, sort, onClick }: { label: string; k: SortKey; sort: { key: SortKey; asc: boolean }; onClick: (k: SortKey) => void }) {
  const active = sort.key === k;
  return (
    <th>
      <button className={cx("inline-flex items-center gap-1 hover:text-text", active && "text-text")} onClick={() => onClick(k)}>
        {label}
        {active ? <span aria-hidden>{sort.asc ? "↑" : "↓"}</span> : null}
      </button>
    </th>
  );
}

/* ---------------- Rename ---------------- */

function RenameDialog({ file, onClose, onSubmit, busy }: { file: FileRow | null; onClose: () => void; onSubmit: (name: string) => void; busy: boolean }) {
  const [name, setName] = useState("");
  useEffect(() => {
    if (file) setName(file.filename);
  }, [file]);
  const extChanged = file && name.split(".").pop()?.toLowerCase() !== file.filename.split(".").pop()?.toLowerCase();
  return (
    <Modal
      open={Boolean(file)}
      onClose={onClose}
      title="Rename file"
      width="max-w-md"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => onSubmit(name)} disabled={!name.trim() || name === file?.filename}>
            Rename
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSubmit(name);
        }}
        className="space-y-3"
      >
        <Field label="New file name" hint="The public address changes to the new name. The old address stops working.">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus onFocus={(e) => e.target.select()} />
        </Field>
        {extChanged ? <Alert tone="warn">The file extension is changing. Make sure that is intended.</Alert> : null}
      </form>
    </Modal>
  );
}

/* ---------------- Link create / edit ---------------- */

function LinkDialog({
  open,
  domain,
  link,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  domain: Domain | null;
  link: LinkRow | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (path: string, notes: string) => void;
}) {
  const [path, setPath] = useState("");
  const [notes, setNotes] = useState("");
  useEffect(() => {
    if (open) {
      setPath(link?.path ?? "");
      setNotes(link?.notes ?? "");
    }
  }, [open, link]);
  const cleaned = path
    .replace(/\\/g, "/")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .join("/");
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={link ? "Edit link" : `New link on ${domain?.hostname ?? ""}`}
      width="max-w-md"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => onSubmit(path, notes)}>
            {link ? "Save changes" : "Create link"}
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(path, notes);
        }}
      >
        <Field
          label="Path"
          hint="Letters, numbers, - _ . and / for nested parts. Leave empty for the domain root."
        >
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[13px] text-text-muted whitespace-nowrap">/</span>
            <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="brochures/2025" autoFocus className="font-mono" />
          </div>
        </Field>
        {domain ? (
          <p className="address">
            <span className="host">https://{domain.hostname}</span>
            <span className="dim">/</span>
            {cleaned ? (
              <>
                {cleaned}
                <span className="dim">/</span>
              </>
            ) : null}
            <span className="dim">‹file-name.pdf›</span>
          </p>
        ) : null}
        {link && cleaned !== link.path ? (
          <Alert tone="warn">
            Changing the path moves every file in this link. Addresses under {displayPath(link.path)} stop working.
          </Alert>
        ) : null}
        <Field label="Notes (optional)">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What this link is for" className="min-h-16" />
        </Field>
      </form>
    </Modal>
  );
}

/* ---------------- Upload / replace ---------------- */

interface UploadItem {
  id: string;
  file: File;
  status: "queued" | "uploading" | "saving" | "done" | "error" | "skipped";
  progress: number;
  error?: string;
  via?: "direct" | "server";
  /** An existing file in this link with the same name; the user decides whether to replace it. */
  conflict?: FileRow;
  /** Set once the user chose to replace: the existing file's id, sent as file_id. */
  replaceId?: string;
}

function UploadDialog({
  open,
  onClose,
  linkId,
  baseUrl,
  replaceTarget,
  existing,
  canReplace,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  linkId: string;
  baseUrl: string;
  replaceTarget: FileRow | null;
  /** Files already in this link, used to ask about same-name uploads before anything is sent. */
  existing: FileRow[];
  canReplace: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [running, setRunning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [askConflicts, setAskConflicts] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const changedRef = useRef(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setItems([]);
      setAskConflicts(false);
      changedRef.current = false;
    }
  }, [open, replaceTarget]);

  /** Same comparison the server makes (cleaned name, case-insensitive), so the question is asked up front instead of failing later. */
  function findExisting(name: string): FileRow | undefined {
    let cleaned: string;
    try {
      cleaned = cleanFilename(name).toLowerCase();
    } catch {
      return undefined;
    }
    return existing.find((f) => f.filename.toLowerCase() === cleaned);
  }

  function addFiles(list: FileList | File[]) {
    const arr = Array.from(list);
    if (!arr.length) return;
    const next: UploadItem[] = arr.map((file) => ({
      id: `${file.name}-${file.size}-${Math.random()}`,
      file,
      status: "queued",
      progress: 0,
      conflict: replaceTarget ? undefined : findExisting(file.name),
    }));
    setItems((prev) => (replaceTarget ? next.slice(0, 1) : [...prev, ...next]));
    if (next.some((n) => n.conflict)) setAskConflicts(true);
  }

  function update(id: string, patch: Partial<UploadItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  async function uploadOne(item: UploadItem) {
    update(item.id, { status: "uploading", progress: 0, error: undefined });
    const replaceId = item.replaceId ?? replaceTarget?.id;
    const presign = await api<{ url: string; key: string; content_type: string; filename: string }>("/api/admin/files/presign", {
      json: {
        link_id: linkId,
        filename: item.file.name,
        size: item.file.size,
        content_type: item.file.type,
        file_id: replaceId,
      },
    });
    try {
      await putWithProgress(presign.url, item.file, presign.content_type, (p) => update(item.id, { progress: p }));
      update(item.id, { via: "direct" });
    } catch (e) {
      const status = e instanceof ClientError ? e.status : -1;
      if (status === 0 && item.file.size <= SERVER_FALLBACK_LIMIT) {
        // Direct upload blocked (usually missing R2 CORS). Small files can go through the server.
        const form = new FormData();
        form.append("file", item.file);
        form.append("link_id", linkId);
        if (replaceId) form.append("file_id", replaceId);
        update(item.id, { status: "uploading", progress: 0, via: "server" });
        await postFormWithProgress("/api/admin/files/upload", form, (p) => update(item.id, { progress: p }));
        update(item.id, { status: "done", progress: 1 });
        changedRef.current = true;
        return;
      }
      if (status === 0) {
        throw new Error("Direct upload to storage was blocked. Add a CORS rule to your R2 bucket (see README) — files over 4 MB need it.");
      }
      throw e;
    }
    update(item.id, { status: "saving" });
    await api("/api/admin/files/complete", {
      json: { link_id: linkId, filename: presign.filename, key: presign.key, content_type: presign.content_type, file_id: replaceId },
    });
    update(item.id, { status: "done", progress: 1 });
    changedRef.current = true;
  }

  async function start() {
    if (conflicts.length) {
      setAskConflicts(true);
      return;
    }
    setRunning(true);
    const queue = items.filter((i) => i.status === "queued" || i.status === "error");
    const workers = Math.min(3, queue.length);
    let index = 0;
    await Promise.all(
      Array.from({ length: workers }, async () => {
        while (index < queue.length) {
          const item = queue[index++];
          try {
            await uploadOne(item);
          } catch (e) {
            update(item.id, { status: "error", error: errorMessage(e) });
          }
        }
      }),
    );
    setRunning(false);
    if (changedRef.current) await onChanged();
  }

  function close() {
    if (running) return;
    // Escape and backdrop clicks reach both dialogs; the question closes first, the upload dialog stays.
    if (askConflicts) {
      setAskConflicts(false);
      return;
    }
    onClose();
  }

  const doneCount = items.filter((i) => i.status === "done").length;
  const pending = items.filter((i) => i.status === "queued" || i.status === "error").length;
  // Queued files whose name is already taken and that have no decision yet.
  const conflicts = items.filter((i) => i.status === "queued" && i.conflict && !i.replaceId);

  function decide(choice: "replace" | "keep") {
    setItems((prev) =>
      prev.map((it) =>
        it.status === "queued" && it.conflict && !it.replaceId
          ? choice === "replace" && canReplace
            ? { ...it, replaceId: it.conflict.id }
            : { ...it, status: "skipped" as const }
          : it,
      ),
    );
    setAskConflicts(false);
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={replaceTarget ? `Replace ${replaceTarget.filename}` : "Upload files"}
      width="max-w-xl"
      footer={
        <>
          {doneCount > 0 ? (
            <span className="mr-auto text-[12.5px] text-text-muted">
              {doneCount} of {items.length} done
            </span>
          ) : null}
          <Button onClick={close} disabled={running}>
            {doneCount > 0 && pending === 0 ? "Close" : "Cancel"}
          </Button>
          <Button variant="primary" onClick={start} loading={running} disabled={pending === 0}>
            {replaceTarget ? "Replace file" : `Upload ${pending || ""}`.trim()}
          </Button>
        </>
      }
    >
      {replaceTarget ? (
        <Alert tone="info" className="mb-3">
          The file keeps its name and public address <span className="font-mono">{baseUrl}{encodeURIComponent(replaceTarget.filename)}</span>. Only the content changes.
        </Alert>
      ) : (
        <p className="text-[13px] text-text-muted mb-3">
          Each file becomes available at <span className="font-mono">{baseUrl}‹file-name›</span> as soon as it finishes.
        </p>
      )}

      <div
        className={cx(
          "border-2 border-dashed rounded-md p-6 text-center transition-colors",
          dragOver ? "border-teal-600 bg-teal-50" : "border-line-strong hover:border-ink-600",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <Upload className="size-6 mx-auto text-text-faint" />
        <p className="mt-2 text-sm">
          Drop {replaceTarget ? "the new file" : "PDF files"} here, or{" "}
          <button className="text-teal-700 font-medium hover:underline" onClick={() => inputRef.current?.click()}>
            browse
          </button>
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple={!replaceTarget}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 ? (
        <ul className="mt-3 divide-y border rounded-md max-h-72 overflow-auto">
          {items.map((it) => (
            <li key={it.id} className="px-3 py-2 text-[13px]">
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-text-faint shrink-0" />
                <span className="truncate flex-1">{it.file.name}</span>
                <span className="text-text-faint tabular-nums whitespace-nowrap">{formatBytes(it.file.size)}</span>
                {it.status === "done" ? <Badge tone="ok">done{it.via === "server" ? " (via server)" : ""}</Badge> : null}
                {it.status === "error" ? <Badge tone="danger">failed</Badge> : null}
                {it.status === "saving" ? <Badge tone="info">saving…</Badge> : null}
                {it.status === "skipped" ? <Badge>skipped — existing kept</Badge> : null}
                {it.status === "queued" && it.replaceId ? <Badge tone="warn">will replace</Badge> : null}
                {it.status === "queued" && it.conflict && !it.replaceId ? (
                  <button type="button" onClick={() => setAskConflicts(true)} title="Decide whether to replace it">
                    <Badge tone="warn">already exists</Badge>
                  </button>
                ) : null}
                {(it.status === "queued" || it.status === "skipped") && !running ? (
                  <IconButton label="Remove" onClick={() => setItems((prev) => prev.filter((x) => x.id !== it.id))}>
                    <X className="size-3.5" />
                  </IconButton>
                ) : null}
              </div>
              {it.status === "uploading" ? (
                <div className="bar mt-1.5">
                  <div style={{ width: `${Math.round(it.progress * 100)}%` }} />
                </div>
              ) : null}
              {it.error ? <p className="text-danger-600 text-[12.5px] mt-1">{it.error}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {!replaceTarget && items.length === 0 ? (
        <p className="mt-3 text-[12px] text-text-faint flex items-center gap-1.5">
          <FolderPlus className="size-3.5" /> If a file with the same name already exists in this link, you will be asked whether to replace it or keep the existing one.
        </p>
      ) : null}
      {doneCount > 0 && pending === 0 && !running ? (
        <p className="mt-3 text-[12.5px] text-ok-600">
          Upload complete.{" "}
          <button
            className="underline"
            onClick={async () => {
              if (await copyText(baseUrl)) toast("Base URL copied");
            }}
          >
            Copy the base URL
          </button>
        </p>
      ) : null}

      <Modal
        open={askConflicts && conflicts.length > 0}
        onClose={() => setAskConflicts(false)}
        title={conflicts.length === 1 ? "This file already exists" : `${conflicts.length} files already exist`}
        width="max-w-md"
        footer={
          <>
            <Button onClick={() => decide("keep")}>No — keep the existing {conflicts.length === 1 ? "file" : "files"}</Button>
            {canReplace ? (
              <Button variant="primary" onClick={() => decide("replace")}>
                Yes — replace {conflicts.length === 1 ? "it" : "them"}
              </Button>
            ) : null}
          </>
        }
      >
        <p className="text-sm">
          {conflicts.length === 1 ? "A file with this name is" : "Files with these names are"} already in this link. Replace{" "}
          {conflicts.length === 1 ? "it" : "them"} with the new {conflicts.length === 1 ? "file" : "files"}? The public address stays the same — only the
          content changes.
        </p>
        <ul className="mt-3 divide-y border rounded-md max-h-48 overflow-auto text-[13px]">
          {conflicts.map((it) => (
            <li key={it.id} className="px-3 py-1.5 flex items-center gap-2">
              <FileText className="size-4 text-text-faint shrink-0" />
              <span className="truncate flex-1 font-mono">{it.conflict?.filename}</span>
              <span className="text-text-faint whitespace-nowrap tabular-nums">
                {formatBytes(it.conflict?.size)} → {formatBytes(it.file.size)}
              </span>
            </li>
          ))}
        </ul>
        {canReplace ? null : (
          <Alert tone="info" className="mt-3">
            You do not have permission to replace files, so the existing {conflicts.length === 1 ? "file stays" : "files stay"} as {conflicts.length === 1 ? "it is" : "they are"}.
          </Alert>
        )}
      </Modal>
    </Modal>
  );
}
