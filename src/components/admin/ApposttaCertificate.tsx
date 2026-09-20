"use client";

import { Download, FileImage, FileCode2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Loading, Modal, errorMessage, useToast } from "@/components/ui";
import { api, downloadSvgAsPng, downloadSvgFile } from "@/lib/client";
import { buildCertificateSvg, type BorderStyle } from "@/lib/certificate";
import type { ApposttaRecord, ApposttaSettings } from "@/lib/types";

/** Preview of a record's certificate, with the PNG/SVG export. */
export function ApposttaCertificate({
  record,
  settings,
  onClose,
}: {
  record: ApposttaRecord | null;
  settings: ApposttaSettings | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [signature, setSignature] = useState<string | null>(null);
  /** Resolved server-side: the record's own signatory, or the settings default when it has none. */
  const [signatoryName, setSignatoryName] = useState("");
  const [loadingSig, setLoadingSig] = useState(false);
  const [busy, setBusy] = useState<"png" | "svg" | null>(null);

  // The image has to arrive as a data: URI or the canvas export is blocked, so it is fetched
  // here rather than pointed at storage.
  useEffect(() => {
    if (!record) {
      setSignature(null);
      return;
    }
    let cancelled = false;
    setLoadingSig(true);
    setSignature(null);
    api<{ data_uri: string | null; signatory_name?: string }>(`/api/admin/appostta/${record.id}/signature`)
      .then((r) => {
        if (cancelled) return;
        setSignature(r.data_uri);
        setSignatoryName(r.signatory_name ?? "");
      })
      .catch(() => {
        if (!cancelled) setSignature(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingSig(false);
      });
    return () => {
      cancelled = true;
    };
  }, [record]);

  const built = useMemo(() => {
    if (!record) return null;
    return buildCertificateSvg({
      orgName: settings?.org_name ?? "",
      orgTagline: settings?.org_tagline ?? "",
      number: record.number,
      issuedOn: record.issued_on,
      fields: record.fields,
      signatoryName: record.signatory_name || signatoryName,
      signatureDataUri: signature,
      verifyUrl: record.verify_url,
      footerNote: settings?.footer_note ?? "",
      watermarkText: settings?.watermark_text ?? "",
      stampText: settings?.stamp_text ?? "",
      stampAfterRow: settings?.stamp_after_row ?? 0,
      verifyNote: settings?.verify_note ?? "",
      borderStyle: (settings?.border_style as BorderStyle) || "ornament",
    });
  }, [record, settings, signature, signatoryName]);

  async function save(kind: "png" | "svg") {
    if (!built || !record) return;
    setBusy(kind);
    try {
      const name = `${record.number}.${kind}`;
      if (kind === "svg") downloadSvgFile(built.svg, name);
      else await downloadSvgAsPng(built.svg, name, 3);
      toast(`Certificate saved as ${name}`);
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      open={Boolean(record)}
      onClose={onClose}
      title={record ? `Certificate — ${record.number}` : "Certificate"}
      width="max-w-3xl"
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button
            icon={<FileCode2 className="size-4" />}
            loading={busy === "svg"}
            disabled={!built}
            onClick={() => save("svg")}
          >
            Download SVG
          </Button>
          <Button
            variant="primary"
            icon={<FileImage className="size-4" />}
            loading={busy === "png"}
            disabled={!built}
            onClick={() => save("png")}
          >
            Download PNG
          </Button>
        </>
      }
    >
      {!record ? null : (
        <div className="space-y-3">
          {!settings?.org_name ? (
            <Alert tone="warn">
              No organisation name is set yet. Open <span className="font-medium">Appostta settings</span> to set the name,
              tagline and signatures that appear on every certificate.
            </Alert>
          ) : null}

          {loadingSig ? (
            <Loading label="Loading signature…" />
          ) : !signature ? (
            <Alert tone="info">
              This record has no signature, and the settings hold none to fall back on, so the signature line is left blank.
            </Alert>
          ) : null}

          <div className="flex justify-center overflow-x-auto bg-surface-2 rounded-md p-4">
            {built ? (
              <div
                className="shadow-sm bg-white"
                style={{ width: built.width, maxWidth: "100%" }}
                // Built by buildCertificateSvg from values it escapes itself.
                dangerouslySetInnerHTML={{ __html: built.svg }}
              />
            ) : null}
          </div>

          <p className="text-[12.5px] text-text-muted flex items-start gap-1.5">
            <Download className="size-3.5 mt-0.5 shrink-0" />
            The QR code resolves to <span className="font-mono break-all">{record.verify_url}</span>. PNG is exported at 3×
            for printing.
          </p>
        </div>
      )}
    </Modal>
  );
}
