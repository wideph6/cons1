"use client";

import { Download, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, Button, CopyButton, Loading, Modal } from "@/components/ui";
import { api } from "@/lib/client";
import type { FileRow } from "@/lib/types";
import { buildPublicUrl, formatBytes, formatDateTime } from "@/lib/utils";

/** Opens a file inline (PDF/image) inside the admin panel using a short-lived storage URL. */
export function FilePreview({ file, onClose }: { file: FileRow | null; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setUrl(null);
    setError(null);
    if (!file) return;
    let cancelled = false;
    api<{ url: string }>(`/api/admin/files/${file.id}/preview`)
      .then((r) => {
        if (!cancelled) setUrl(r.url);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load preview");
      });
    return () => {
      cancelled = true;
    };
  }, [file]);

  async function download() {
    if (!file) return;
    const r = await api<{ url: string }>(`/api/admin/files/${file.id}/preview?download=1`);
    window.location.href = r.url;
  }

  const publicUrl = file?.link ? buildPublicUrl(file.link.domain.hostname, file.link.path, file.filename) : null;
  const isImage = file?.content_type.startsWith("image/");
  const isPdf = file?.content_type === "application/pdf";

  return (
    <Modal
      open={Boolean(file)}
      onClose={onClose}
      title={file?.filename ?? ""}
      width="max-w-5xl"
      footer={
        file ? (
          <>
            <span className="mr-auto text-[12.5px] text-text-muted">
              {formatBytes(file.size)} · uploaded {formatDateTime(file.uploaded_at)}
              {file.uploader ? ` by ${file.uploader.name || file.uploader.email}` : ""} · {file.download_count} downloads
            </span>
            {publicUrl ? <CopyButton text={publicUrl} size="md" /> : null}
            {url ? (
              <Button icon={<ExternalLink className="size-4" />} onClick={() => window.open(url, "_blank", "noopener")}>
                Open in new tab
              </Button>
            ) : null}
            <Button variant="primary" icon={<Download className="size-4" />} onClick={download}>
              Download
            </Button>
          </>
        ) : null
      }
    >
      {publicUrl ? (
        <p className="address mb-3">
          <span className="host">{`https://${file!.link!.domain.hostname}`}</span>
          <span className="dim">/</span>
          {file!.link!.path ? (
            <>
              {file!.link!.path}
              <span className="dim">/</span>
            </>
          ) : null}
          <span className="text-white">{encodeURIComponent(file!.filename)}</span>
        </p>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {!url && !error ? <Loading label="Preparing preview…" /> : null}
      {url && isPdf ? (
        <iframe title={file?.filename} src={url} className="w-full h-[70vh] rounded border bg-surface-2" />
      ) : null}
      {url && isImage ? (
        <div className="flex justify-center bg-surface-2 rounded border p-3 max-h-[70vh] overflow-auto">
          <img src={url} alt={file?.filename} className="max-h-[66vh] object-contain" />
        </div>
      ) : null}
      {url && !isPdf && !isImage ? (
        <Alert tone="info">This file type cannot be shown inline. Use Open in new tab or Download.</Alert>
      ) : null}
    </Modal>
  );
}
