"use client";

import { FileText, FolderTree, Globe, Upload } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FilePreview } from "@/components/admin/FilePreview";
import { useSession } from "@/components/SessionProvider";
import { Alert, Badge, Button, Card, EmptyState, Loading, PageHeader } from "@/components/ui";
import { api } from "@/lib/client";
import type { Activity, DashboardStats, FileRow } from "@/lib/types";
import { ACTION_LABELS, displayPath, formatBytes, formatDateTime, timeAgo } from "@/lib/utils";

interface StatsResponse {
  stats: DashboardStats;
  activity: Activity[];
  recent_files: FileRow[];
}

export function Dashboard() {
  const { user, isSuper, can } = useSession();
  const [data, setData] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<FileRow | null>(null);

  useEffect(() => {
    api<StatsResponse>("/api/admin/stats")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load dashboard"));
  }, []);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!data) return <Loading />;
  const s = data.stats;

  const tiles: Array<{ label: string; value: string; sub?: string }> = [
    { label: "Domains", value: String(s.domains), sub: `${s.active_domains} active` },
    { label: "Links", value: String(s.links) },
    { label: "Files", value: String(s.files), sub: formatBytes(s.total_size) },
    { label: "Downloads", value: String(s.downloads) },
    { label: "Uploaded today", value: String(s.uploads_today), sub: `${s.uploads_7d} in 7 days` },
  ];

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user.name || user.email}`}
        description="What is happening across your domains and links."
        actions={
          <>
            {can("upload") ? (
              <Button variant="primary" icon={<Upload className="size-4" />} onClick={() => (window.location.href = "/admin/files")}>
                Upload a file
              </Button>
            ) : null}
            {can("create_domain") ? (
              <Link href="/admin/domains">
                <Button icon={<Globe className="size-4" />}>Add a domain</Button>
              </Link>
            ) : null}
          </>
        }
      />

      <div className="bg-surface border rounded-md grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-x divide-y sm:divide-y-0 mb-5">
        {tiles.map((t) => (
          <div key={t.label} className="px-4 py-3">
            <div className="text-[12px] text-text-muted">{t.label}</div>
            <div className="text-2xl font-semibold tabular-nums leading-tight mt-0.5">{t.value}</div>
            {t.sub ? <div className="text-[12px] text-text-faint mt-0.5">{t.sub}</div> : null}
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[3fr_2fr]">
        <Card
          title="Recent uploads"
          padded={false}
          actions={
            <Link href="/admin/files" className="text-[13px] text-teal-700 hover:underline inline-flex items-center gap-1">
              <FolderTree className="size-3.5" /> Open file manager
            </Link>
          }
        >
          {data.recent_files.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No files yet"
                description="Add a domain, create a link under it, then upload a PDF. The public address is ready the moment the upload finishes."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Location</th>
                    <th>Size</th>
                    <th>Uploaded</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_files.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <button
                          className="inline-flex items-center gap-2 text-left hover:text-teal-700 disabled:hover:text-inherit"
                          onClick={() => setPreview(f)}
                          disabled={!can("preview")}
                        >
                          <FileText className="size-4 text-text-faint shrink-0" />
                          <span className="truncate max-w-[260px]">{f.filename}</span>
                        </button>
                      </td>
                      <td className="font-mono text-[12.5px] text-text-muted">
                        {f.link ? (
                          <Link href={`/admin/files?link=${f.link.id}`} className="hover:text-teal-700">
                            {f.link.domain.hostname}
                            {displayPath(f.link.path)}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="tabular-nums whitespace-nowrap">{formatBytes(f.size)}</td>
                      <td className="whitespace-nowrap text-text-muted">
                        {timeAgo(f.uploaded_at)}
                        {f.uploader ? <span className="text-text-faint"> · {f.uploader.name || f.uploader.email}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          title={isSuper ? "Recent activity" : "Your recent activity"}
          padded={false}
          actions={
            isSuper || can("view_activity") ? (
              <Link href="/admin/activity" className="text-[13px] text-teal-700 hover:underline">
                View all
              </Link>
            ) : null
          }
        >
          {data.activity.length === 0 ? (
            <p className="p-4 text-sm text-text-muted">Nothing recorded yet.</p>
          ) : (
            <ul className="divide-y">
              {data.activity.map((a) => (
                <li key={a.id} className="px-4 py-2.5 text-[13px] flex gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge tone={a.action === "delete" || a.action.startsWith("delete_") ? "danger" : a.action === "upload" ? "teal" : "neutral"}>
                        {ACTION_LABELS[a.action] ?? a.action}
                      </Badge>
                      <span className="text-text-muted truncate">{a.user?.name || a.user?.email || "Deleted user"}</span>
                    </div>
                    <div className="font-mono text-[12px] text-text-muted truncate mt-0.5">
                      {[a.domain_hostname, a.link_path ? `/${a.link_path}` : a.domain_hostname ? "/" : null, a.filename]
                        .filter(Boolean)
                        .join(" ")}
                    </div>
                  </div>
                  <time className="text-text-faint whitespace-nowrap text-[12px]" title={formatDateTime(a.created_at)}>
                    {timeAgo(a.created_at)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <FilePreview file={preview} onClose={() => setPreview(null)} />
    </>
  );
}
