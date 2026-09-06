"use client";

import { AlertTriangle, CheckCircle2, ExternalLink, RefreshCw, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, CopyButton, Loading, Modal, errorMessage } from "@/components/ui";
import { api } from "@/lib/client";
import type { FileRow } from "@/lib/types";

interface Finding {
  level: "ok" | "warn" | "fail";
  text: string;
  hint?: string;
}

interface CheckResult {
  public_url: string;
  hostname: string;
  link_path: string;
  filename: string;
  download_mode: string;
  findings: Finding[];
  public_route: { status: number; location?: string; reason?: string; contentType?: string; error?: string };
  signed_url: { status: number; error?: string };
  storage: { exists: boolean; size?: number };
}

/** Runs the server-side download-chain check for one file and explains where it breaks. */
export function LinkCheck({ file, onClose }: { file: FileRow | null; onClose: () => void }) {
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const runCheck = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await api<CheckResult>(`/api/admin/files/${file.id}/check`));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [file]);

  useEffect(() => {
    setResult(null);
    setError(null);
    if (file) runCheck();
  }, [file, runCheck]);

  const failed = result?.findings.some((f) => f.level === "fail");
  const Icon = ({ level }: { level: Finding["level"] }) =>
    level === "ok" ? (
      <CheckCircle2 className="size-4 text-ok-600 shrink-0 mt-0.5" />
    ) : level === "warn" ? (
      <AlertTriangle className="size-4 text-warn-600 shrink-0 mt-0.5" />
    ) : (
      <XCircle className="size-4 text-danger-600 shrink-0 mt-0.5" />
    );

  return (
    <Modal
      open={Boolean(file)}
      onClose={onClose}
      title="Check public link"
      width="max-w-2xl"
      footer={
        <>
          <Button icon={<RefreshCw className="size-4" />} onClick={runCheck} loading={loading}>
            Run again
          </Button>
          {result ? <CopyButton text={result.public_url} size="md" /> : null}
          {result ? (
            <Button variant="primary" icon={<ExternalLink className="size-4" />} onClick={() => window.open(result.public_url, "_blank", "noopener")}>
              Open link
            </Button>
          ) : null}
        </>
      }
    >
      {result ? (
        <p className="address mb-4">
          <span className="host">https://{result.hostname}</span>
          <span className="dim">/</span>
          {result.link_path ? (
            <>
              {result.link_path}
              <span className="dim">/</span>
            </>
          ) : null}
          <span className="text-white">{encodeURIComponent(result.filename)}</span>
        </p>
      ) : null}

      {loading && !result ? <Loading label="Testing storage, signed link and public address…" /> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {result ? (
        <>
          <Alert tone={failed ? "danger" : "ok"} className="mb-3">
            {failed ? "The download chain is broken. The first red item below is the cause." : "Everything works. Anyone opening this address gets the file."}
          </Alert>
          <ol className="space-y-2.5">
            {result.findings.map((f, i) => (
              <li key={i} className="flex gap-2.5 text-sm">
                <Icon level={f.level} />
                <div className="min-w-0">
                  <div className={f.level === "fail" ? "font-medium" : ""}>{f.text}</div>
                  {f.hint ? <div className="text-[12.5px] text-text-muted mt-0.5 break-words">{f.hint}</div> : null}
                </div>
              </li>
            ))}
          </ol>
          <details className="mt-4 text-[12px] text-text-muted">
            <summary className="cursor-pointer">Raw details</summary>
            <pre className="mt-2 p-2 bg-surface-2 border rounded overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(
                { download_mode: result.download_mode, storage: result.storage, signed_url: result.signed_url, public_route: result.public_route },
                null,
                2,
              )}
            </pre>
          </details>
        </>
      ) : null}
    </Modal>
  );
}
