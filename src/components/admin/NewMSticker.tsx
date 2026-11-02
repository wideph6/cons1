"use client";

import { Download, FileCode, ImageUp, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Alert, Button, Checkbox, Loading, Modal, errorMessage, useToast } from "@/components/ui";
import { api, downloadSvgAsPng, downloadSvgFile } from "@/lib/client";
import { NUMBER_EXAMPLE, resolveLink, STANDARD_TEMPLATE } from "@/lib/new-m-link";
import {
  buildStickerOverlaySvg,
  buildStickerSvg,
  clampPlacement,
  cleanPlacement,
  coverPlacement,
  FULL_PLACEMENT,
  STICKER_H,
  STICKER_W,
  type BackgroundPlacement,
  type Measure,
  type StickerValues,
} from "@/lib/new-m-sticker";
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

/** Pixel size of an image, or 0 x 0 when it cannot be opened. */
function imageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = src;
  });
}

interface Background {
  /** The background artwork the super admin uploaded. */
  dataUri: string;
  /** Pixel size, so the PNG keeps all of a large background's detail. */
  width: number;
  height: number;
  /** The image already has the title bar, lines and labels, so the app must not draw them again. */
  hasFrame: boolean;
  /** Where it sits on the sticker; null stretches it over the whole sticker. */
  placement: BackgroundPlacement | null;
}

/** Fetched once per page and reused for every sticker, until a new background is set. */
let backgroundCache: Promise<Background> | null = null;

export function forgetBackground() {
  backgroundCache = null;
}

/** The uploaded background; fails with the server's reason when there is none, and no sticker is made. */
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
    let placement: BackgroundPlacement | null = null;
    try {
      placement = cleanPlacement(JSON.parse(res.headers.get("x-background-placement") || "null"));
    } catch {
      /* none saved */
    }
    const dataUri = await blobToDataUri(await res.blob());
    const size = await imageSize(dataUri);
    return { dataUri, width: size.width || STICKER_W, height: size.height || STICKER_H, hasFrame, placement };
  })().catch((e) => {
    backgroundCache = null;
    throw e;
  });
  return backgroundCache;
}

/** PNGs come out at three times the layout size at least, or at the background's own resolution if higher. */
function scaleFor(bg: Background): number {
  return Math.max(3, bg.width / (bg.placement ?? FULL_PLACEMENT).width);
}

/** The officer's signature a document carries, inline, or null for none. */
function recordSignature(record: NewMRecord): Promise<string | null> {
  return record.officer_signature_r2_key
    ? api<{ data_uri: string | null }>(`/api/admin/new-m/${record.id}/signature`).then((r) => r.data_uri)
    : Promise.resolve(null);
}

/** What a document writes onto its sticker. */
function recordValues(record: NewMRecord, signature: string | null): StickerValues {
  return {
    documentType: record.document_type,
    issuingOffice: record.issuing_office,
    issueDate: record.issue_date,
    issuingAuthority: record.issuing_authority,
    attestationNumber: record.attestation_number,
    designation: record.officer_designation,
    signature,
    qrSvg: record.qr_svg,
    qrUrl: record.qr_url ?? record.verify_url,
  };
}

/** One document's sticker, built from its current values, its officer's signature and its saved QR code. */
export async function renderSticker(record: NewMRecord): Promise<{ svg: string; scale: number }> {
  const [bg, signature] = await Promise.all([loadBackground(), recordSignature(record)]);
  const svg = buildStickerSvg(
    {
      background: bg.dataUri,
      placement: bg.placement,
      drawFrame: !bg.hasFrame,
      ...recordValues(record, signature),
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
  uploaded: boolean;
  filename: string | null;
  /** The uploaded image already has the title bar, lines and labels on it. */
  has_frame: boolean;
  placement: BackgroundPlacement | null;
  updated_at: string | null;
}

/** The image in the editor: the one in use, or a newly chosen file not saved yet. */
interface EditorImage {
  dataUri: string;
  width: number;
  height: number;
  file: File | null;
}

/** Shown when there are no documents yet to take real values from. */
function sampleValues(): StickerValues {
  const today = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const iso = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`;
  return {
    documentType: "Personal Document",
    issuingOffice: "Islamabad",
    issueDate: iso,
    issuingAuthority: "Ministry of Foreign Affairs",
    attestationNumber: NUMBER_EXAMPLE,
    designation: "Assistant Director",
    signature: null,
    qrSvg: null,
    qrUrl: resolveLink("example.com", STANDARD_TEMPLATE, NUMBER_EXAMPLE, iso),
  };
}

const MAX_ZOOM = 4;

function samePlacement(a: BackgroundPlacement, b: BackgroundPlacement): boolean {
  return (
    Math.abs(a.x - b.x) < 0.01 &&
    Math.abs(a.y - b.y) < 0.01 &&
    Math.abs(a.width - b.width) < 0.01 &&
    Math.abs(a.height - b.height) < 0.01
  );
}

/**
 * The super admin's background picker. Shows the image under one document's real values, signature
 * and QR code, exactly where every sticker writes them; the image is dragged and zoomed until its
 * cells sit under them, and that position is saved for every sticker, on screen and downloaded. The
 * image always covers the whole sticker: zooming in crops it.
 */
export function NewMBackgroundDialog({
  open,
  onClose,
  sample,
}: {
  open: boolean;
  onClose: () => void;
  /** The document whose values are shown on the preview, or null for sample values. */
  sample: NewMRecord | null;
}) {
  const { toast } = useToast();
  const [info, setInfo] = useState<BackgroundInfo | null>(null);
  /** The image in use, as loaded, so changes can be thrown away. */
  const [saved, setSaved] = useState<EditorImage | null>(null);
  const [image, setImage] = useState<EditorImage | null>(null);
  const [placement, setPlacement] = useState<BackgroundPlacement>(FULL_PLACEMENT);
  const [hasFrame, setHasFrame] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; from: BackgroundPlacement } | null>(null);

  useEffect(() => {
    if (!open) return;
    setInfo(null);
    setSaved(null);
    setImage(null);
    setError(null);
    setLoading(true);
    let cancelled = false;
    (async () => {
      const i = await api<BackgroundInfo>("/api/admin/new-m/background?info=1");
      if (cancelled) return;
      setInfo(i);
      setHasFrame(i.has_frame);
      setPlacement(i.placement ?? FULL_PLACEMENT);
      if (!i.uploaded) return;
      forgetBackground();
      const bg = await loadBackground();
      if (cancelled) return;
      const current = { dataUri: bg.dataUri, width: bg.width, height: bg.height, file: null };
      setSaved(current);
      setImage(current);
    })()
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    setSignature(null);
    if (!open || !sample) return;
    let cancelled = false;
    recordSignature(sample)
      .then((s) => {
        if (!cancelled) setSignature(s);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, sample]);

  // Everything but the background, redrawn only when the values or the frame setting change; dragging
  // moves the image underneath it.
  const overlay = useMemo(() => {
    if (!open) return null;
    const values = sample ? recordValues(sample, signature) : sampleValues();
    return svgDataUri(buildStickerOverlaySvg({ drawFrame: !hasFrame, ...values }, measure));
  }, [open, sample, signature, hasFrame]);

  async function choose(file: File | null) {
    setError(null);
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return setError("Choose a JPG, PNG or WebP image.");
    if (file.size > 4 * 1024 * 1024) return setError("The background image must be 4 MB or smaller.");
    const dataUri = await blobToDataUri(file);
    const size = await imageSize(dataUri);
    if (!size.width || !size.height) return setError("That image could not be opened.");
    setImage({ dataUri, ...size, file });
    setPlacement(coverPlacement(size.width, size.height));
    setHasFrame(false);
  }

  function discard() {
    setError(null);
    setImage(saved);
    setHasFrame(info?.has_frame ?? false);
    setPlacement(info?.placement ?? FULL_PLACEMENT);
  }

  async function save() {
    if (!image) return;
    setBusy(true);
    try {
      let next: BackgroundInfo;
      if (image.file) {
        const form = new FormData();
        form.append("file", image.file);
        form.append("has_frame", hasFrame ? "1" : "0");
        form.append("placement", JSON.stringify(placement));
        const res = await fetch("/api/admin/new-m/background", { method: "POST", body: form });
        const body = (await res.json().catch(() => ({}))) as BackgroundInfo & { error?: string };
        if (!res.ok) throw new Error(body.error ?? `Saving failed (${res.status})`);
        next = body;
      } else {
        next = await api<BackgroundInfo>("/api/admin/new-m/background", {
          method: "PATCH",
          json: { has_frame: hasFrame, placement },
        });
      }
      forgetBackground();
      const current = { ...image, file: null };
      setInfo(next);
      setSaved(current);
      setImage(current);
      setPlacement(next.placement ?? FULL_PLACEMENT);
      toast(image.file ? "Background saved — every sticker now uses it" : "Position saved — every sticker now uses it");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  /* ----- Moving and zooming ----- */

  const cover = image ? coverPlacement(image.width, image.height) : FULL_PLACEMENT;
  const zoom = Math.max(1, placement.width / cover.width);

  function zoomTo(z: number) {
    const next = Math.min(MAX_ZOOM, Math.max(1, z));
    // The point at the sticker's centre stays where it is.
    const fx = (STICKER_W / 2 - placement.x) / placement.width;
    const fy = (STICKER_H / 2 - placement.y) / placement.height;
    const width = cover.width * next;
    const height = cover.height * next;
    setPlacement(clampPlacement({ x: STICKER_W / 2 - fx * width, y: STICKER_H / 2 - fy * height, width, height }));
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!image || busy) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, from: placement };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    // Screen pixels to sticker units; the preview keeps the sticker's proportions, so one factor serves both.
    const unit = STICKER_W / e.currentTarget.clientWidth;
    setPlacement(clampPlacement({ ...d.from, x: d.from.x + (e.clientX - d.x) * unit, y: d.from.y + (e.clientY - d.y) * unit }));
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id === e.pointerId) drag.current = null;
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[e.key];
    if (!move || !image || busy) return;
    e.preventDefault();
    setPlacement((p) => clampPlacement({ ...p, x: p.x + move[0], y: p.y + move[1] }));
  }

  const dirty = Boolean(
    image &&
      (image.file ||
        hasFrame !== (info?.has_frame ?? false) ||
        !samePlacement(placement, info?.placement ?? FULL_PLACEMENT)),
  );
  // The layout is measured on a 958 x 761 sheet; an image of other proportions is cropped to it.
  const ratioOff = image ? Math.abs(image.width / image.height / (STICKER_W / STICKER_H) - 1) > 0.015 : false;
  const stretched = samePlacement(placement, FULL_PLACEMENT);

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="Background image"
      width="max-w-4xl"
      footer={
        <>
          {dirty && saved ? (
            <Button disabled={busy} onClick={discard} className="mr-auto">
              Discard changes
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
              {image ? "Choose a new image" : "Upload an image"}
            </span>
          </label>
          {image ? (
            <Button variant="primary" loading={busy} disabled={!dirty} onClick={save}>
              {image.file ? "Use this background" : "Save position"}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] text-text-muted">
          Every sticker is drawn on this image; only the super admin can change it, and it is kept in storage, not in the
          app&apos;s code. The values, signature and QR code always sit where they are shown here: drag the image and zoom
          until its cells line up under them, then save. Every sticker, on screen and downloaded, uses that position.
        </p>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {image?.file ? (
          <Alert tone={ratioOff ? "warn" : "info"}>
            New image: {image.file.name} ({image.width} × {image.height}).{" "}
            {ratioOff
              ? `Its proportions differ from the sticker (${STICKER_W} × ${STICKER_H}), so part of it is cropped — drag and zoom to choose what shows.`
              : "Line it up below, then press Use this background. It takes the current image's place."}
          </Alert>
        ) : info && !info.uploaded && !loading ? (
          <Alert tone="warn">
            No background image yet, so no sticker can be made. Upload one to start.
          </Alert>
        ) : info?.uploaded ? (
          <p className="text-[12.5px] text-text-muted">
            In use: {info.filename ?? "uploaded image"}
            {info.updated_at ? `, set ${formatDateTime(info.updated_at)}` : ""}
          </p>
        ) : null}

        {image ? (
          <>
            <Checkbox
              label="This image already has the title bar, table lines and labels printed on it"
              description="Ticked, the app writes only the values, signature and QR code onto it."
              checked={hasFrame}
              disabled={busy}
              onChange={(e) => setHasFrame(e.target.checked)}
            />
            <div
              tabIndex={0}
              role="group"
              aria-label="Background position: drag to move, arrow keys to nudge"
              className="relative w-full overflow-hidden border rounded bg-white select-none touch-none cursor-grab active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
              style={{ aspectRatio: `${STICKER_W} / ${STICKER_H}` }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={onKeyDown}
            >
              <img
                src={image.dataUri}
                alt=""
                draggable={false}
                className="absolute max-w-none pointer-events-none"
                style={{
                  left: `${(placement.x / STICKER_W) * 100}%`,
                  top: `${(placement.y / STICKER_H) * 100}%`,
                  width: `${(placement.width / STICKER_W) * 100}%`,
                  height: `${(placement.height / STICKER_H) * 100}%`,
                }}
              />
              {overlay ? (
                <img src={overlay} alt="Sticker values over the background" className="absolute inset-0 size-full pointer-events-none" />
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[12.5px] text-text-muted">
              <label className="inline-flex items-center gap-2">
                Zoom
                <input
                  type="range"
                  min={1}
                  max={MAX_ZOOM}
                  step={0.01}
                  value={zoom}
                  disabled={busy}
                  onChange={(e) => zoomTo(Number(e.target.value))}
                  className="w-40 accent-teal-600"
                />
                <span className="tabular-nums w-11">{Math.round(zoom * 100)}%</span>
              </label>
              <Button
                size="sm"
                icon={<RotateCcw className="size-3.5" />}
                disabled={busy}
                onClick={() => setPlacement(coverPlacement(image.width, image.height))}
              >
                Reset
              </Button>
              {ratioOff ? (
                <Button size="sm" disabled={busy || stretched} onClick={() => setPlacement(FULL_PLACEMENT)}>
                  Stretch to fit
                </Button>
              ) : null}
              <span className="ml-auto">
                Drag to move · arrow keys nudge by 1, with Shift by 10 · left {Math.round(placement.x)}, top{" "}
                {Math.round(placement.y)}
              </span>
            </div>
            <p className="text-[12.5px] text-text-muted">
              {sample
                ? `Shown with the values of ${sample.attestation_number}, the first document in the list.`
                : "Shown with sample values — there are no documents yet."}
            </p>
          </>
        ) : loading ? (
          <Loading label="Loading the background…" />
        ) : null}
      </div>
    </Modal>
  );
}
