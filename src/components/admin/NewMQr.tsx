"use client";

import { Download, FileCode } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, CopyButton, Modal, cx, errorMessage, useToast } from "@/components/ui";
import { downloadSvgAsPng, downloadSvgFile } from "@/lib/client";
import { verifyQrSvg } from "@/lib/new-m-link";
import type { NewMRecord } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** A QR code SVG shown as an image. */
export function QrSvgImage({ svg, className, alt = "QR code" }: { svg: string; className?: string; alt?: string }) {
  const src = useMemo(() => svgDataUri(svg), [svg]);
  return <img src={src} alt={alt} className={cx("bg-white [image-rendering:pixelated]", className)} />;
}

/**
 * The QR code a link would get, drawn in the browser. Only for previewing a document that is not saved
 * yet; once saved, the server draws the code and stores it with the document.
 */
export function LinkQrPreview({ url, className, alt }: { url: string; className?: string; alt?: string }) {
  const svg = useMemo(() => verifyQrSvg(url), [url]);
  return <QrSvgImage svg={svg} className={className} alt={alt} />;
}

/** The QR code saved with one document, large, with its link and downloads. */
export function NewMQrDialog({ record, onClose }: { record: NewMRecord | null; onClose: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const svg = record?.qr_svg ?? "";

  async function savePng() {
    if (!record || !svg) return;
    setBusy(true);
    try {
      // The stored code is 10 px per module; doubled, a version 6 code comes to 980 px.
      await downloadSvgAsPng(svg, `${record.attestation_number}-qr.png`, 2);
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={Boolean(record)}
      onClose={onClose}
      title={record ? `QR code — ${record.attestation_number}` : ""}
      width="max-w-md"
      footer={
        record ? (
          <>
            <CopyButton text={record.verify_url} label="Copy link" size="md" />
            <Button
              icon={<FileCode className="size-4" />}
              disabled={!svg}
              onClick={() => downloadSvgFile(svg, `${record.attestation_number}-qr.svg`)}
            >
              SVG
            </Button>
            <Button variant="primary" icon={<Download className="size-4" />} loading={busy} disabled={!svg} onClick={savePng}>
              PNG
            </Button>
          </>
        ) : null
      }
    >
      {record ? (
        <div className="space-y-3">
          {svg ? (
            <QrSvgImage svg={svg} alt={`QR code for ${record.attestation_number}`} className="mx-auto size-64 border rounded" />
          ) : (
            <p className="text-sm text-text-muted text-center py-10">The QR code is not saved yet. Refresh the list.</p>
          )}
          <div className="rounded-md border bg-surface-2 px-3 py-2">
            <div className="text-[11.5px] text-text-muted mb-0.5">Scans to</div>
            <div className="font-mono text-[12.5px] break-all">{record.qr_url ?? record.verify_url}</div>
          </div>
          <p className="text-[12.5px] text-text-muted">
            Saved with the document{record.qr_updated_at ? ` on ${formatDateTime(record.qr_updated_at)}` : ""}. Editing the
            attestation number, the date or the domain changes the link, and a new QR code replaces this one.
          </p>
        </div>
      ) : null}
    </Modal>
  );
}
