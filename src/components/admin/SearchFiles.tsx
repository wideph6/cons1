"use client";

import { Copy, Download, Eye, FileText, FolderOpen, Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FilePreview } from "@/components/admin/FilePreview";
import { useSession } from "@/components/SessionProvider";
import { Alert, Button, Card, EmptyState, Field, IconButton, Input, Loading, PageHeader, Pagination, Select, errorMessage, useToast } from "@/components/ui";
import { api, copyText, localToIso, qs } from "@/lib/client";
import type { Domain, FileRow, Paged, User } from "@/lib/types";
import { buildPublicUrl, displayPath, formatBytes, formatDateTime } from "@/lib/utils";

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const LIMIT = 50;

export function SearchFiles() {
  const { isSuper, can } = useSession();
  const { toast } = useToast();
  const router = useRouter();
  const sp = useSearchParams();

  const [domains, setDomains] = useState<Domain[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [from, setFrom] = useState(sp.get("from") ?? "");
  const [to, setTo] = useState(sp.get("to") ?? "");
  const [dateField, setDateField] = useState<"uploaded_at" | "updated_at">(sp.get("date_field") === "updated_at" ? "updated_at" : "uploaded_at");
  const [domainId, setDomainId] = useState(sp.get("domain_id") ?? "");
  const [linkId, setLinkId] = useState(sp.get("link_id") ?? "");
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [uploadedBy, setUploadedBy] = useState(sp.get("uploaded_by") ?? "");
  const [offset, setOffset] = useState(0);

  const [result, setResult] = useState<Paged<FileRow> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<FileRow | null>(null);

  useEffect(() => {
    api<{ items: Domain[] }>("/api/admin/domains?include=links").then((r) => setDomains(r.items)).catch(() => undefined);
    if (isSuper) api<{ items: User[] }>("/api/admin/users").then((r) => setUsers(r.items)).catch(() => undefined);
  }, [isSuper]);

  const links = useMemo(() => domains.find((d) => d.id === domainId)?.links ?? [], [domains, domainId]);

  const runSearch = useCallback(
    async (newOffset = 0) => {
      setLoading(true);
      setError(null);
      setOffset(newOffset);
      const params = {
        search: 1,
        from: localToIso(from),
        to: localToIso(to),
        date_field: dateField,
        domain_id: domainId,
        link_id: linkId,
        q,
        uploaded_by: uploadedBy,
        limit: LIMIT,
        offset: newOffset,
      };
      router.replace(`/admin/search${qs({ from, to, date_field: dateField, domain_id: domainId, link_id: linkId, q, uploaded_by: uploadedBy })}`);
      try {
        setResult(await api<Paged<FileRow>>(`/api/admin/files${qs(params)}`));
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    },
    [from, to, dateField, domainId, linkId, q, uploadedBy, router],
  );

  // Run once on load when the URL already carries filters.
  useEffect(() => {
    if (sp.get("from") || sp.get("to") || sp.get("q") || sp.get("domain_id")) runSearch(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function quick(range: "today" | "yesterday" | "7d" | "30d" | "month") {
    const now = new Date();
    const start = new Date(now);
    let end = new Date(now);
    start.setHours(0, 0, 0, 0);
    if (range === "yesterday") {
      start.setDate(start.getDate() - 1);
      end = new Date(start);
      end.setHours(23, 59, 0, 0);
    } else if (range === "7d") start.setDate(start.getDate() - 6);
    else if (range === "30d") start.setDate(start.getDate() - 29);
    else if (range === "month") start.setDate(1);
    setFrom(toLocalInput(start));
    setTo(toLocalInput(end));
  }

  function exportCsv() {
    if (!result?.items.length) return;
    const rows = [
      ["File", "Public URL", "Domain", "Link", "Size (bytes)", "Uploaded at", "Uploaded by", "Last change", "Downloads"],
      ...result.items.map((f) => [
        f.filename,
        f.link ? buildPublicUrl(f.link.domain.hostname, f.link.path, f.filename) : "",
        f.link?.domain.hostname ?? "",
        f.link ? displayPath(f.link.path) : "",
        String(f.size),
        f.uploaded_at,
        f.uploader?.email ?? "",
        f.updated_at,
        String(f.download_count),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `files-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <PageHeader title="Search files by date" description="Find files uploaded (or changed) within a date and time range, on any domain or link." />

      <Card className="mb-4">
        <form
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            runSearch(0);
          }}
        >
          <Field label="From">
            <Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <Input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label="Date to match">
            <Select value={dateField} onChange={(e) => setDateField(e.target.value as "uploaded_at" | "updated_at")}>
              <option value="uploaded_at">Upload date</option>
              <option value="updated_at">Last change (rename / replace)</option>
            </Select>
          </Field>
          <Field label="File name contains">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. invoice" />
          </Field>
          <Field label="Domain">
            <Select
              value={domainId}
              onChange={(e) => {
                setDomainId(e.target.value);
                setLinkId("");
              }}
            >
              <option value="">All domains</option>
              {domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.hostname}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Link">
            <Select value={linkId} onChange={(e) => setLinkId(e.target.value)} disabled={!domainId}>
              <option value="">{domainId ? "All links on this domain" : "Choose a domain first"}</option>
              {links.map((l) => (
                <option key={l.id} value={l.id}>
                  {displayPath(l.path)}
                </option>
              ))}
            </Select>
          </Field>
          {isSuper ? (
            <Field label="Uploaded by">
              <Select value={uploadedBy} onChange={(e) => setUploadedBy(e.target.value)}>
                <option value="">Anyone</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <div className="flex items-end gap-2 md:col-span-2 xl:col-span-1 xl:justify-end">
            <Button
              onClick={() => {
                setFrom("");
                setTo("");
                setQ("");
                setDomainId("");
                setLinkId("");
                setUploadedBy("");
              }}
            >
              Clear
            </Button>
            <Button type="submit" variant="primary" icon={<Search className="size-4" />} loading={loading}>
              Search
            </Button>
          </div>
        </form>
        <div className="flex flex-wrap items-center gap-1.5 mt-3 text-[12.5px]">
          <span className="text-text-muted mr-1">Quick range:</span>
          {(["today", "yesterday", "7d", "30d", "month"] as const).map((r) => (
            <Button key={r} size="sm" variant="ghost" onClick={() => quick(r)}>
              {r === "today" ? "Today" : r === "yesterday" ? "Yesterday" : r === "7d" ? "Last 7 days" : r === "30d" ? "Last 30 days" : "This month"}
            </Button>
          ))}
        </div>
      </Card>

      {error ? <Alert tone="danger" className="mb-4">{error}</Alert> : null}
      {loading && !result ? <Loading label="Searching…" /> : null}

      {result ? (
        <Card
          padded={false}
          title={`${result.total} file${result.total === 1 ? "" : "s"} found`}
          actions={
            result.items.length ? (
              <Button size="sm" icon={<Download className="size-3.5" />} onClick={exportCsv}>
                Export CSV (this page)
              </Button>
            ) : null
          }
        >
          {result.items.length === 0 ? (
            <div className="p-4">
              <EmptyState title="Nothing in that range" description="Widen the dates or clear a filter and search again." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Domain / link</th>
                    <th>Size</th>
                    <th>Uploaded</th>
                    <th>Last change</th>
                    <th>By</th>
                    <th>Downloads</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((f) => {
                    const url = f.link ? buildPublicUrl(f.link.domain.hostname, f.link.path, f.filename) : "";
                    return (
                      <tr key={f.id}>
                        <td>
                          <button className="inline-flex items-center gap-2 hover:text-teal-700 max-w-[320px] disabled:hover:text-inherit" onClick={() => setPreview(f)} disabled={!can("preview")}>
                            <FileText className="size-4 text-text-faint shrink-0" />
                            <span className="truncate">{f.filename}</span>
                          </button>
                        </td>
                        <td className="font-mono text-[12.5px] text-text-muted whitespace-nowrap">
                          {f.link ? `${f.link.domain.hostname}${displayPath(f.link.path)}` : "—"}
                        </td>
                        <td className="tabular-nums whitespace-nowrap">{formatBytes(f.size)}</td>
                        <td className="whitespace-nowrap">{formatDateTime(f.uploaded_at)}</td>
                        <td className="whitespace-nowrap text-text-muted">{f.replaced_at || f.renamed_at ? formatDateTime(f.updated_at) : "—"}</td>
                        <td className="whitespace-nowrap text-text-muted">{f.uploader?.name || f.uploader?.email || "—"}</td>
                        <td className="tabular-nums">{f.download_count}</td>
                        <td>
                          <div className="flex items-center justify-end gap-0.5">
                            {url ? (
                              <IconButton
                                label="Copy public link"
                                onClick={async () => {
                                  if (await copyText(url)) toast("Link copied");
                                }}
                              >
                                <Copy className="size-3.5" />
                              </IconButton>
                            ) : null}
                            {can("preview") ? (
                              <IconButton label="Preview" onClick={() => setPreview(f)}>
                                <Eye className="size-3.5" />
                              </IconButton>
                            ) : null}
                            {f.link ? (
                              <Link href={`/admin/files?link=${f.link.id}`}>
                                <IconButton label="Open in file manager">
                                  <FolderOpen className="size-3.5" />
                                </IconButton>
                              </Link>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pagination total={result.total} limit={result.limit} offset={offset} onChange={(o) => runSearch(o)} />
        </Card>
      ) : null}

      <FilePreview file={preview} onClose={() => setPreview(null)} />
    </>
  );
}
