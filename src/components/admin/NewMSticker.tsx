"use client";

import { Download, FileCode, ImageUp, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, Button, Checkbox, Loading, Modal, errorMessage, useToast } from "@/components/ui";
import { api, downloadSvgAsPng, downloadSvgFile } from "@/lib/client";
import { NUMBER_EXAMPLE, resolveLink, STANDARD_TEMPLATE } from "@/lib/new-m-link";
import { buildStickerSvg, STICKER_H, STICKER_W, type Measure } from "@/lib/new-m-sticker";
import type { NewMRecord } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

/* ---------------- Shared pieces ---------------- */

let measureCtx: CanvasRenderingContext2D | null = null;

/** Widths come from the browser's own text engine, the same one that draws the sticker. */
const measure: Measure = (text, font) => {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return 0;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
};

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("The image could not be read"));
    reader.readAsDataURL(blob);
  });
}

function imageWidth(src: string): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth || STICKER_W);
    img.onerror = () => resolve(STICKER_W);
    img.src = src;
  });
}

interface Background {
  dataUri: string;
  /** Pixel width, so the PNG keeps all of a large background's detail. */
  width: number;
  /** The image already has the title bar, lines and labels, so the app must not draw them again. */
  hasFrame: boolean;
}

/** Fetched once per page and reused for every sticker, until a new background is set. */
let backgroundCache: Promise<Background> | null = null;

export function forgetBackground() {
  backgroundCache = null;
}

function loadBackground(): Promise<Background> {
  backgroundCache ??= (async () => {
    const res = await fetch("/api/admin/new-m/background", { cache: "no-store" });
    if (!res.ok) {
      let message = `Could not load the sticker background (${res.status})`;
      try {
        message = ((await res.json()) as { error?: string }).error ?? message;
      } catch {
        /* not JSON */
      }
      throw new Error(message);
    }
    const hasFrame = res.headers.get("x-background-has-frame") === "1";
    const dataUri = await blobToDataUri(await res.blob());
    return { dataUri, width: await imageWidth(dataUri), hasFrame };
  })().catch((e) => {
    backgroundCache = null;
    throw e;
  });
  return backgroundCache;
}

/** PNGs come out at three times the layout size at least, or at the background's own size if larger. */
function scaleFor(bg: Background): number {
  return Math.max(3, bg.width / STICKER_W);
}

/** One document's sticker, built from its current values, its officer's signature and its saved QR code. */
export async function renderSticker(record: NewMRecord): Promise<{ svg: string; scale: number }> {
  const [bg, signature] = await Promise.all([
    loadBackground(),
    record.officer_signature_r2_key
      ? api<{ data_uri: string | null }>(`/api/admin/new-m/${record.id}/signature`).then((r) => r.data_uri)
      : Promise.resolve(null),
  ]);
  const svg = buildStickerSvg(
    {
      background: bg.dataUri,
      drawFrame: !bg.hasFrame,
      documentType: record.document_type,
      issuingOffice: record.issuing_office,
      issueDate: record.issue_date,
      issuingAuthority: record.issuing_authority,
      attestationNumber: record.attestation_number,
      designation: record.officer_designation,
      signature,
      qrSvg: record.qr_svg,
      qrUrl: record.qr_url ?? record.verify_url,
    },
    measure,
  );
  return { svg, scale: scaleFor(bg) };
}

export async function downloadSticker(record: NewMRecord): Promise<void> {
  const { svg, scale } = await renderSticker(record);
  await downloadSvgAsPng(svg, `${record.attestation_number}-sticker.png`, scale);
}

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/* ---------------- One document's sticker ---------------- */

export function NewMStickerDialog({ record, onClose }: { record: NewMRecord | null; onClose: () => void }) {
  const { toast } = useToast();
  const [sticker, setSticker] = useState<{ svg: string; scale: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSticker(null);
    setError(null);
    if (!record) return;
    let cancelled = false;
    renderSticker(record)
      .then((s) => {
        if (!cancelled) setSticker(s);
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [record]);

  async function savePng() {
    if (!record || !sticker) return;
    setBusy(true);
    try {
      await downloadSvgAsPng(sticker.svg, `${record.attestation_number}-sticker.png`, sticker.scale);
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
      title={record ? `Sticker — ${record.attestation_number}` : ""}
      width="max-w-4xl"
      footer={
        record ? (
          <>
            <span className="mr-auto text-[12.5px] text-text-muted">Made from the document as it reads now.</span>
            <Button
              icon={<FileCode className="size-4" />}
              disabled={!sticker}
              onClick={() => sticker && downloadSvgFile(sticker.svg, `${record.attestation_number}-sticker.svg`)}
            >
              Download SVG
            </Button>
            <Button variant="primary" icon={<Download className="size-4" />} loading={busy} disabled={!sticker} onClick={savePng}>
              Download PNG
            </Button>
          </>
        ) : null
      }
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {!sticker && !error ? <Loading label="Making the sticker…" /> : null}
      {sticker ? (
        <img
          src={svgDataUri(sticker.svg)}
          alt={`Sticker for ${record?.attestation_number}`}
          className="w-full h-auto border rounded bg-white"
        />
      ) : null}
    </Modal>
  );
}

/* ---------------- Background (super admin) ---------------- */

interface BackgroundInfo {
  custom: boolean;
  filename: string | null;
  /** The uploaded image already has the title bar, lines and labels on it. */
  has_frame: boolean;
  updated_at: string | null;
}

/** Values the background preview is drawn with, so the alignment can be judged before it is saved. */
function sampleSvg(background: string, drawFrame: boolean): string {
  const today = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const iso = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`;
  return buildStickerSvg(
    {
      background,
      drawFrame,
      documentType: "Personal Document",
      issuingOffice: "Islamabad",
      issueDate: iso,
      issuingAuthority: "Ministry of Foreign Affairs",
      attestationNumber: NUMBER_EXAMPLE,
      designation: "Assistant Director",
      signature: null,
      qrSvg: null,
      qrUrl: resolveLink("example.com", STANDARD_TEMPLATE, NUMBER_EXAMPLE, iso),
    },
    measure,
  );
}

/**
 * The super admin's background picker. Shows the current background with sample values written in,
 * so a new one can be checked for alignment before it replaces the old. The app draws the title bar,
 * table lines and labels itself; an image that already has them printed is marked so they are not
 * drawn twice.
 */
export function NewMBackgroundDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [info, setInfo] = useState<BackgroundInfo | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [chosen, setChosen] = useState<{ file: File; dataUri: string; width: number; height: number } | null>(null);
  /** For the chosen image: it already has the frame printed on it. */
  const [chosenHasFrame, setChosenHasFrame] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setChosen(null);
    setChosenHasFrame(false);
    setError(null);
    setCurrent(null);
    api<BackgroundInfo>("/api/admin/new-m/background?info=1")
      .then(setInfo)
      .catch((e) => setError(errorMessage(e)));
    loadBackground()
      .then((bg) => setCurrent(bg.dataUri))
      .catch((e) => setError(errorMessage(e)));
  }, [open]);

  async function choose(file: File | null) {
    setError(null);
    if (!file) return setChosen(null);
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return setError("Choose a JPG, PNG or WebP image.");
    if (file.size > 4 * 1024 * 1024) return setError("The background image must be 4 MB or smaller.");
    const dataUri = await blobToDataUri(file);
    const size = await new Promise<{ width: number; height: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({ width: 0, height: 0 });
      img.src = dataUri;
    });
    if (!size.width) return setError("That image could not be opened.");
    setChosen({ file, dataUri, ...size });
    setChosenHasFrame(false);
  }

  async function save() {
    if (!chosen) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", chosen.file);
      form.append("has_frame", chosenHasFrame ? "1" : "0");
      const res = await fetch("/api/admin/new-m/background", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as BackgroundInfo & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Saving failed (${res.status})`);
      forgetBackground();
      setInfo(body);
      setCurrent(chosen.dataUri);
      setChosen(null);
      toast("Background saved — every sticker now uses it");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function setCurrentHasFrame(hasFrame: boolean) {
    setBusy(true);
    try {
      setInfo(await api<BackgroundInfo>("/api/admin/new-m/background", { method: "PATCH", json: { has_frame: hasFrame } }));
      forgetBackground();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    try {
      setInfo(await api<BackgroundInfo>("/api/admin/new-m/background", { method: "DELETE" }));
      forgetBackground();
      setCurrent((await loadBackground()).dataUri);
      toast("Back to the built-in background");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const shown = chosen?.dataUri ?? current;
  const shownHasFrame = chosen ? chosenHasFrame : Boolean(info?.custom && info.has_frame);
  // The layout is measured on a 958 x 761 sheet; a background of other proportions gets stretched.
  const ratioOff = chosen ? Math.abs(chosen.width / chosen.height / (STICKER_W / STICKER_H) - 1) > 0.015 : false;

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="Background image"
      width="max-w-4xl"
      footer={
        <>
          {info?.custom && !chosen ? (
            <Button icon={<RotateCcw className="size-4" />} disabled={busy} onClick={restore} className="mr-auto">
              Restore the built-in background
            </Button>
          ) : null}
          <label className="inline-flex">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                void choose(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            <span className="inline-flex items-center gap-2 h-9 px-3.5 rounded-md border border-line-strong bg-surface text-sm font-medium cursor-pointer hover:bg-surface-2">
              <ImageUp className="size-4" />
              Choose a new image
            </span>
          </label>
          {chosen ? (
            <Button variant="primary" loading={busy} onClick={save}>
              Use this background
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] text-text-muted">
          Every sticker is drawn on this image; only the super admin can change it. The app draws the title bar, table
          lines, labels and QR border itself so they print sharp — the image only needs the background pattern and the
          Seal/Stamp cell, at the same layout and proportions. Shown here with sample values.
        </p>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {chosen ? (
          <Alert tone={ratioOff ? "warn" : "info"}>
            New image: {chosen.file.name} ({chosen.width} × {chosen.height}).{" "}
            {ratioOff
              ? `Its proportions differ from the sticker layout (${STICKER_W} × ${STICKER_H}), so it will be stretched and the values may not line up.`
              : "Check the sample values below sit where they should, then press Use this background."}
          </Alert>
        ) : info ? (
          <p className="text-[12.5px] text-text-muted">
            In use:{" "}
            {info.custom
              ? `${info.filename ?? "custom image"}${info.updated_at ? `, set ${formatDateTime(info.updated_at)}` : ""}`
              : "the built-in background"}
          </p>
        ) : null}
        {chosen ? (
          <Checkbox
            label="This image already has the title bar, table lines and labels printed on it"
            description="Ticked, the app writes only the values, signature and QR code onto it."
            checked={chosenHasFrame}
            disabled={busy}
            onChange={(e) => setChosenHasFrame(e.target.checked)}
          />
        ) : info?.custom ? (
          <Checkbox
            label="This image already has the title bar, table lines and labels printed on it"
            description="Ticked, the app writes only the values, signature and QR code onto it. Saved as soon as it changes."
            checked={info.has_frame}
            disabled={busy}
            onChange={(e) => void setCurrentHasFrame(e.target.checked)}
          />
        ) : null}
        {shown ? (
          <img
            src={svgDataUri(sampleSvg(shown, !shownHasFrame))}
            alt="Sticker background with sample values"
            className="w-full h-auto border rounded bg-white"
          />
        ) : !error ? (
          <Loading label="Loading the background…" />
        ) : null}
      </div>
    </Modal>
  );
}
