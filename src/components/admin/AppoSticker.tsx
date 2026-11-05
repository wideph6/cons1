"use client";

import { Crop, Download, FileCode, Group, ImageUp, Move, RotateCcw, Ungroup } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Alert, Button, Checkbox, Field, Input, Loading, Modal, errorMessage, useToast } from "@/components/ui";
import { api, downloadSvgAsPng, downloadSvgFile } from "@/lib/client";
import { numberExample, resolveLink, STANDARD_TEMPLATE } from "@/lib/appo-link";
import {
  buildStickerOverlaySvg,
  buildStickerSvg,
  clampOffset,
  clampPlacement,
  cleanPlacement,
  fitPlacement,
  FULL_PLACEMENT,
  groupRect,
  MAX_PIECE_TEXT,
  MIN_KEEP,
  NO_CROP,
  PIECES,
  pieceText,
  SET_PARTS,
  shiftRect,
  STICKER_H,
  STICKER_SETS,
  STICKER_W,
  stickerSetBoxes,
  visibleRect,
  withCrop,
  withLayout,
  withTexts,
  type BackgroundCrop,
  type BackgroundPlacement,
  type Measure,
  type Rect,
  type SetLayout,
  type SetOffset,
  type SetPart,
  type StickerLayout,
  type StickerSetId,
  type StickerTexts,
  type StickerValues,
} from "@/lib/appo-sticker";
import type { AppoRecord } from "@/lib/appo-types";
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
    const res = await fetch("/api/admin/appo/background", { cache: "no-store" });
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
      // Sent URI-encoded, as reworded labels may hold letters a header cannot carry as they are.
      placement = cleanPlacement(JSON.parse(decodeURIComponent(res.headers.get("x-background-placement") || "null")));
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
function recordSignature(record: AppoRecord): Promise<string | null> {
  return record.officer_signature_r2_key
    ? api<{ data_uri: string | null }>(`/api/admin/appo/${record.id}/signature`).then((r) => r.data_uri)
    : Promise.resolve(null);
}

/** What a document writes onto its sticker. */
function recordValues(record: AppoRecord, signature: string | null): StickerValues {
  return {
    documentType: record.document_type,
    signedBy: record.signed_by,
    signedCapacity: record.signed_capacity,
    sealStamp: record.seal_stamp,
    officeCity: record.office_city,
    issueDate: record.issue_date,
    officeName: record.office_name,
    attestationNumber: record.attestation_number,
    officerName: record.officer_name,
    signature,
    qrSvg: record.qr_svg,
    qrUrl: record.qr_url ?? record.verify_url,
  };
}

/** One document's sticker, built from its current values, its officer's signature and its saved QR code. */
export async function renderSticker(record: AppoRecord): Promise<{ svg: string; scale: number }> {
  const [bg, signature] = await Promise.all([loadBackground(), recordSignature(record)]);
  const svg = buildStickerSvg(
    {
      background: bg.dataUri,
      placement: bg.placement,
      drawFrame: !bg.hasFrame,
      layout: bg.placement?.layout,
      texts: bg.placement?.texts,
      ...recordValues(record, signature),
    },
    measure,
  );
  return { svg, scale: scaleFor(bg) };
}

export async function downloadSticker(record: AppoRecord): Promise<void> {
  const { svg, scale } = await renderSticker(record);
  await downloadSvgAsPng(svg, `${record.attestation_number}-sticker.png`, scale);
}

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/* ---------------- One document's sticker ---------------- */

export function AppoStickerDialog({ record, onClose }: { record: AppoRecord | null; onClose: () => void }) {
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
  /** The uploaded image already has the fixed words (numbers and labels) on it. */
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

type Side = keyof BackgroundCrop;

/** Shown when there are no documents yet to take real values from. */
function sampleValues(): StickerValues {
  const today = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const iso = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`;
  return {
    documentType: "Personal Document",
    signedBy: "Muhammad Ali",
    signedCapacity: "Notary Public",
    sealStamp: "Notary Public, Gujrat",
    officeCity: "Islamabad",
    issueDate: iso,
    officeName: "Ministry of Foreign Affairs",
    attestationNumber: numberExample(),
    officerName: "Muhammad Junaid Khalid",
    signature: null,
    qrSvg: null,
    qrUrl: resolveLink("example.com", STANDARD_TEMPLATE, numberExample(), iso),
  };
}

/** Zoom is the image's width against the sticker's: 1 is as wide as the sticker. */
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;

/** Position and size only; the crop is kept apart while editing. */
function box(p: BackgroundPlacement): BackgroundPlacement {
  return { x: p.x, y: p.y, width: p.width, height: p.height };
}

function samePlacement(a: BackgroundPlacement, b: BackgroundPlacement): boolean {
  const ca = a.crop ?? NO_CROP;
  const cb = b.crop ?? NO_CROP;
  const close = (u: number, v: number, by: number) => Math.abs(u - v) < by;
  return (
    close(a.x, b.x, 0.01) &&
    close(a.y, b.y, 0.01) &&
    close(a.width, b.width, 0.01) &&
    close(a.height, b.height, 0.01) &&
    (["top", "right", "bottom", "left"] as const).every((s) => close(ca[s], cb[s], 0.0001)) &&
    STICKER_SETS.every(({ id }) => sameSet(a.layout?.[id], b.layout?.[id])) &&
    PIECES.every((p) => pieceText(p, a.texts) === pieceText(p, b.texts))
  );
}

function sameSet(a: SetLayout | undefined, b: SetLayout | undefined): boolean {
  const close = (u: number, v: number) => Math.abs(u - v) < 0.01;
  const same = (u: SetOffset | undefined, v: SetOffset | undefined) =>
    close(u?.dx ?? 0, v?.dx ?? 0) && close(u?.dy ?? 0, v?.dy ?? 0);
  return same(a, b) && Boolean(a?.split) === Boolean(b?.split) && SET_PARTS.every((p) => same(a?.parts?.[p], b?.parts?.[p]));
}

const STILL: SetOffset = { dx: 0, dy: 0 };
/** Breathing room round a set's box in the editor, in sticker units. */
const SET_PAD = 3;

const SET_NAMES = Object.fromEntries(STICKER_SETS.map((s) => [s.id, s.name])) as Record<StickerSetId, string>;
const PART_NAMES: Record<SetPart, string> = { label: "words", value: "value" };

/** What is picked while moving: a whole set, or one half of an ungrouped one. */
interface Picked {
  set: StickerSetId;
  part: SetPart | null;
}

function pickedName(p: Picked): string {
  return p.part ? `${SET_NAMES[p.set]} — ${PART_NAMES[p.part]}` : SET_NAMES[p.set];
}

/** A set's own move, without its halves'. */
function setMove(l: SetLayout | undefined): SetOffset {
  return { dx: l?.dx ?? 0, dy: l?.dy ?? 0 };
}

/** A placement as CSS on the editor's image, in percentages of the sticker. */
function boxStyle(p: BackgroundPlacement) {
  return {
    left: `${(p.x / STICKER_W) * 100}%`,
    top: `${(p.y / STICKER_H) * 100}%`,
    width: `${(p.width / STICKER_W) * 100}%`,
    height: `${(p.height / STICKER_H) * 100}%`,
  };
}

const pct = (share: number) => `${Math.round(share * 100)}%`;

/**
 * The super admin's background picker. Shows the image under one document's real values, signature
 * and QR code, exactly where every sticker writes them. The image is dragged in any direction and
 * zoomed until its cells sit under them, then cropped in place to cut off what is not wanted. The
 * values with their words, the QR code, the signature and the officer's name can be moved too, set by
 * set; a set can be ungrouped to move its words and its value apart, and its words reworded for the
 * sticker. All of it is saved in the database for every sticker, on screen and downloaded.
 */
export function AppoBackgroundDialog({
  open,
  onClose,
  sample,
}: {
  open: boolean;
  onClose: () => void;
  /** The document whose values are shown on the preview, or null for sample values. */
  sample: AppoRecord | null;
}) {
  const { toast } = useToast();
  const [info, setInfo] = useState<BackgroundInfo | null>(null);
  /** The image in use, as loaded, so changes can be thrown away. */
  const [saved, setSaved] = useState<EditorImage | null>(null);
  const [image, setImage] = useState<EditorImage | null>(null);
  const [placement, setPlacement] = useState<BackgroundPlacement>(FULL_PLACEMENT);
  const [crop, setCrop] = useState<BackgroundCrop>(NO_CROP);
  /** Showing the crop handles and the cut-off parts. */
  const [cropping, setCropping] = useState(false);
  /** The sets moved off their measured places. */
  const [layout, setLayout] = useState<StickerLayout>({});
  /** Moving the values and QR code instead of the image. */
  const [arranging, setArranging] = useState(false);
  const [selected, setSelected] = useState<Picked | null>(null);
  /** The fixed words reworded for the sticker. */
  const [texts, setTexts] = useState<StickerTexts>({});
  const [hasFrame, setHasFrame] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; from: BackgroundPlacement } | null>(null);
  const cropDrag = useRef<{ id: number; side: Side } | null>(null);
  const setDrag = useRef<{ id: number; set: StickerSetId; part: SetPart | null; x: number; y: number; from: SetOffset } | null>(null);

  function showSaved(p: BackgroundPlacement | null) {
    setPlacement(box(p ?? FULL_PLACEMENT));
    setCrop(p?.crop ?? NO_CROP);
    setLayout(p?.layout ?? {});
    setTexts(p?.texts ?? {});
  }

  useEffect(() => {
    if (!open) return;
    setInfo(null);
    setSaved(null);
    setImage(null);
    setCropping(false);
    setArranging(false);
    setSelected(null);
    setError(null);
    setLoading(true);
    let cancelled = false;
    (async () => {
      const i = await api<BackgroundInfo>("/api/admin/appo/background?info=1");
      if (cancelled) return;
      setInfo(i);
      setHasFrame(i.has_frame);
      showSaved(i.placement);
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

  const values = useMemo(() => (sample ? recordValues(sample, signature) : sampleValues()), [sample, signature]);

  // Everything but the background, redrawn when the values, the frame setting or a moved set change;
  // dragging the image only moves it underneath.
  const overlay = useMemo(() => {
    if (!open) return null;
    return svgDataUri(buildStickerOverlaySvg({ drawFrame: !hasFrame, layout, texts, ...values }, measure));
  }, [open, values, hasFrame, layout, texts]);

  /** Where each set (and each half of it) is drawn before it is moved, for grabbing it. */
  const setBoxes = useMemo(
    () => (open ? stickerSetBoxes({ drawFrame: !hasFrame, texts, ...values }, measure) : {}),
    [open, values, hasFrame, texts],
  );

  async function choose(file: File | null) {
    setError(null);
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return setError("Choose a JPG, PNG or WebP image.");
    if (file.size > 4 * 1024 * 1024) return setError("The background image must be 4 MB or smaller.");
    const dataUri = await blobToDataUri(file);
    const size = await imageSize(dataUri);
    if (!size.width || !size.height) return setError("That image could not be opened.");
    setImage({ dataUri, ...size, file });
    setPlacement(fitPlacement(size.width, size.height));
    setCrop(NO_CROP);
    setCropping(false);
    setHasFrame(false);
  }

  function discard() {
    setError(null);
    setImage(saved);
    setHasFrame(info?.has_frame ?? false);
    showSaved(info?.placement ?? null);
    setCropping(false);
    setArranging(false);
    setSelected(null);
  }

  async function save() {
    if (!image) return;
    setBusy(true);
    try {
      const sent = withTexts(withLayout(withCrop(placement, crop), layout), texts);
      let next: BackgroundInfo;
      if (image.file) {
        const form = new FormData();
        form.append("file", image.file);
        form.append("has_frame", hasFrame ? "1" : "0");
        form.append("placement", JSON.stringify(sent));
        const res = await fetch("/api/admin/appo/background", { method: "POST", body: form });
        const body = (await res.json().catch(() => ({}))) as BackgroundInfo & { error?: string };
        if (!res.ok) throw new Error(body.error ?? `Saving failed (${res.status})`);
        next = body;
      } else {
        next = await api<BackgroundInfo>("/api/admin/appo/background", {
          method: "PATCH",
          json: { has_frame: hasFrame, placement: sent },
        });
      }
      forgetBackground();
      const current = { ...image, file: null };
      setInfo(next);
      setSaved(current);
      setImage(current);
      showSaved(next.placement);
      setCropping(false);
      setArranging(false);
      setSelected(null);
      toast(image.file ? "Background saved — every sticker now uses it" : "Saved — every sticker now uses it");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  /* ----- Moving and zooming ----- */

  /** Keeps some of the cropped image on the sticker. */
  function kept(p: BackgroundPlacement, c: BackgroundCrop = crop): BackgroundPlacement {
    return box(clampPlacement(withCrop(p, c)));
  }

  const zoom = placement.width / STICKER_W;

  function zoomTo(z: number) {
    if (!image) return;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
    // The point at the sticker's centre stays where it is.
    const fx = (STICKER_W / 2 - placement.x) / placement.width;
    const fy = (STICKER_H / 2 - placement.y) / placement.height;
    const width = STICKER_W * next;
    const height = (width * image.height) / image.width;
    setPlacement(kept({ x: STICKER_W / 2 - fx * width, y: STICKER_H / 2 - fy * height, width, height }));
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!image || busy) return;
    // While the values are being moved, the image stays put; a click beside every set lets go of the chosen one.
    if (arranging) return setSelected(null);
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, from: placement };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    // Screen pixels to sticker units; the preview keeps the sticker's proportions, so one factor serves both.
    const unit = STICKER_W / e.currentTarget.clientWidth;
    setPlacement(kept({ ...d.from, x: d.from.x + (e.clientX - d.x) * unit, y: d.from.y + (e.clientY - d.y) * unit }));
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
    if (arranging) {
      if (selected) movePicked(selected, (o) => ({ dx: o.dx + move[0], dy: o.dy + move[1] }));
      return;
    }
    setPlacement((p) => kept({ ...p, x: p.x + move[0], y: p.y + move[1] }));
  }

  /* ----- Moving the values, labels and QR code ----- */

  /** Moves one set, or one half of an ungrouped set, never off the sticker. */
  function movePicked({ set, part }: Picked, to: (from: SetOffset) => SetOffset) {
    const b = setBoxes[set];
    if (!b) return;
    setLayout((l) => {
      const cur = l[set];
      if (!part) return { ...l, [set]: { ...cur, ...clampOffset(groupRect(b, cur), to(setMove(cur))) } };
      const r = b.parts[part];
      if (!r) return l;
      const next = clampOffset(shiftRect(r, setMove(cur)), to(cur?.parts?.[part] ?? STILL));
      return { ...l, [set]: { ...setMove(cur), ...cur, parts: { ...cur?.parts, [part]: next } } };
    });
  }

  /** The move a drag of the picked set (or half) starts from. */
  function pickedMove({ set, part }: Picked): SetOffset {
    const cur = layout[set];
    return part ? (cur?.parts?.[part] ?? STILL) : setMove(cur);
  }

  function onSetDown(picked: Picked, e: PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    if (busy) return;
    setSelected(picked);
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag.current = { id: e.pointerId, ...picked, x: e.clientX, y: e.clientY, from: pickedMove(picked) };
  }

  function onSetMove(e: PointerEvent<HTMLDivElement>) {
    const d = setDrag.current;
    const frame = frameRef.current;
    if (!d || d.id !== e.pointerId || !frame) return;
    const unit = STICKER_W / frame.clientWidth;
    movePicked(d, () => ({ dx: d.from.dx + (e.clientX - d.x) * unit, dy: d.from.dy + (e.clientY - d.y) * unit }));
  }

  function onSetUp(e: PointerEvent<HTMLDivElement>) {
    if (setDrag.current?.id === e.pointerId) setDrag.current = null;
  }

  /** Ungrouped, the set's words and value move each on its own; grouped again, they move together where they are. */
  function setSplit(set: StickerSetId, split: boolean) {
    setLayout((l) => {
      const cur = { ...setMove(l[set]), ...l[set] };
      if (split) cur.split = true;
      else delete cur.split;
      return { ...l, [set]: cur };
    });
    setSelected({ set, part: split ? "label" : null });
  }

  function putBack(set: StickerSetId) {
    setLayout((l) => {
      const next = { ...l };
      delete next[set];
      return next;
    });
    setSelected((s) => (s ? { set: s.set, part: null } : s));
  }

  /** The words a set writes and the value it shows; only sets that have both can be ungrouped. */
  const canSplit = (set: StickerSetId) => Boolean(setBoxes[set]?.parts.label && setBoxes[set]?.parts.value);
  const isSplit = (set: StickerSetId) => Boolean(layout[set]?.split) && canSplit(set);

  const movedAny = Object.keys(layout).length > 0;
  const selectedOffset = selected ? pickedMove(selected) : null;
  const selectedChanged = selected ? Boolean(layout[selected.set]) : false;
  /** The fixed words of the picked set, which can be reworded for the sticker while the app draws them. */
  const selectedPieces = selected && !hasFrame ? PIECES.filter((p) => p.set === selected.set) : [];
  const rewordedAny = PIECES.some((p) => pieceText(p, texts) !== p.text);

  /** Every grab box: one per grouped set, or one per half of an ungrouped set, where it is drawn now. */
  const grabBoxes = STICKER_SETS.flatMap(({ id }): Array<{ picked: Picked; rect: Rect }> => {
    const b = setBoxes[id];
    if (!b) return [];
    const l = layout[id];
    const off = setMove(l);
    if (isSplit(id)) {
      return SET_PARTS.map((part) => ({ picked: { set: id, part }, rect: shiftRect(shiftRect(b.parts[part]!, l?.parts?.[part] ?? STILL), off) }));
    }
    return [{ picked: { set: id, part: null }, rect: shiftRect(groupRect(b, l), off) }];
  });

  /* ----- Cropping ----- */

  function onHandleDown(side: Side, e: PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    if (busy) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    cropDrag.current = { id: e.pointerId, side };
  }

  /** The dragged edge of the crop follows the pointer, never past the opposite edge. */
  function onHandleMove(e: PointerEvent<HTMLDivElement>) {
    const d = cropDrag.current;
    const frame = frameRef.current;
    if (!d || d.id !== e.pointerId || !frame) return;
    const r = frame.getBoundingClientRect();
    // Where the pointer is across and down the image, as a share of it.
    const fx = (((e.clientX - r.left) * STICKER_W) / r.width - placement.x) / placement.width;
    const fy = (((e.clientY - r.top) * STICKER_H) / r.height - placement.y) / placement.height;
    const within = (v: number, max: number) => Math.min(Math.max(v, 0), max);
    setCrop((c) => {
      if (d.side === "left") return { ...c, left: within(fx, 1 - c.right - MIN_KEEP) };
      if (d.side === "right") return { ...c, right: within(1 - fx, 1 - c.left - MIN_KEEP) };
      if (d.side === "top") return { ...c, top: within(fy, 1 - c.bottom - MIN_KEEP) };
      return { ...c, bottom: within(1 - fy, 1 - c.top - MIN_KEEP) };
    });
  }

  function onHandleUp(e: PointerEvent<HTMLDivElement>) {
    if (cropDrag.current?.id === e.pointerId) cropDrag.current = null;
  }

  // The crop's outline and handles, kept to the part of it that is on the sticker.
  const shown = visibleRect(withCrop(placement, crop));
  const onX = (v: number) => Math.min(Math.max(v, 0), STICKER_W);
  const onY = (v: number) => Math.min(Math.max(v, 0), STICKER_H);
  const outline = { x1: onX(shown.x), x2: onX(shown.x + shown.width), y1: onY(shown.y), y2: onY(shown.y + shown.height) };
  const midX = (outline.x1 + outline.x2) / 2;
  const midY = (outline.y1 + outline.y2) / 2;
  const handles: Array<{ side: Side; x: number; y: number }> = [
    { side: "left", x: outline.x1, y: midY },
    { side: "right", x: outline.x2, y: midY },
    { side: "top", x: midX, y: outline.y1 },
    { side: "bottom", x: midX, y: outline.y2 },
  ];
  const cut = crop.top > 0 || crop.right > 0 || crop.bottom > 0 || crop.left > 0;

  const dirty = Boolean(
    image &&
      (image.file ||
        hasFrame !== (info?.has_frame ?? false) ||
        !samePlacement(withTexts(withLayout(withCrop(placement, crop), layout), texts), info?.placement ?? FULL_PLACEMENT)),
  );
  // The layout is measured on a 958 x 761 sheet; an image of other proportions needs moving and cropping to fit.
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
          until its cells line up under them, then crop off what is not wanted. With Move text &amp; QR, each value with its
          words, the QR code, the signature and the officer&apos;s name under it can be moved too; a value can be ungrouped
          from its words to move each on its own, and the words can be changed for the sticker. Save, and every sticker, on
          screen and downloaded, is made exactly so.
        </p>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {image?.file ? (
          <Alert tone={ratioOff ? "warn" : "info"}>
            New image: {image.file.name} ({image.width} × {image.height}).{" "}
            {ratioOff
              ? `Its proportions differ from the sticker (${STICKER_W} × ${STICKER_H}) — move, zoom and crop it to fit.`
              : "Line it up below, then press Use this background. It takes the current image's place."}
          </Alert>
        ) : info && !info.uploaded && !loading ? (
          <Alert tone="warn">No background image yet, so no sticker can be made. Upload one to start.</Alert>
        ) : info?.uploaded ? (
          <p className="text-[12.5px] text-text-muted">
            In use: {info.filename ?? "uploaded image"}
            {info.updated_at ? `, set ${formatDateTime(info.updated_at)}` : ""}
          </p>
        ) : null}

        {image ? (
          <>
            <Checkbox
              label="This image already has the numbers and labels printed on it"
              description="Ticked, the app writes only the values, signature, officer's name and QR code onto it."
              checked={hasFrame}
              disabled={busy}
              onChange={(e) => setHasFrame(e.target.checked)}
            />
            <div
              ref={frameRef}
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
              {cropping ? (
                <img
                  src={image.dataUri}
                  alt=""
                  draggable={false}
                  className="absolute max-w-none pointer-events-none opacity-30"
                  style={boxStyle(placement)}
                />
              ) : null}
              <img
                src={image.dataUri}
                alt=""
                draggable={false}
                className="absolute max-w-none pointer-events-none"
                style={{
                  ...boxStyle(placement),
                  clipPath: `inset(${crop.top * 100}% ${crop.right * 100}% ${crop.bottom * 100}% ${crop.left * 100}%)`,
                }}
              />
              {overlay ? (
                <img src={overlay} alt="Sticker values over the background" className="absolute inset-0 size-full pointer-events-none" />
              ) : null}
              {cropping ? (
                <>
                  <div
                    className="absolute border-2 border-dashed border-teal-600 pointer-events-none"
                    style={{
                      left: `${(outline.x1 / STICKER_W) * 100}%`,
                      top: `${(outline.y1 / STICKER_H) * 100}%`,
                      width: `${((outline.x2 - outline.x1) / STICKER_W) * 100}%`,
                      height: `${((outline.y2 - outline.y1) / STICKER_H) * 100}%`,
                    }}
                  />
                  {handles.map((h) => {
                    const across = h.side === "left" || h.side === "right";
                    return (
                      <div
                        key={h.side}
                        aria-label={`Crop ${h.side} edge`}
                        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-teal-600 bg-white shadow touch-none"
                        style={{
                          // Kept a few pixels inside the preview, so an edge at the sticker's border can still be grabbed.
                          left: `clamp(7px, ${(h.x / STICKER_W) * 100}%, calc(100% - 7px))`,
                          top: `clamp(7px, ${(h.y / STICKER_H) * 100}%, calc(100% - 7px))`,
                          width: across ? 12 : 40,
                          height: across ? 40 : 12,
                          cursor: across ? "ew-resize" : "ns-resize",
                        }}
                        onPointerDown={(e) => onHandleDown(h.side, e)}
                        onPointerMove={onHandleMove}
                        onPointerUp={onHandleUp}
                        onPointerCancel={onHandleUp}
                      />
                    );
                  })}
                </>
              ) : null}
              {arranging
                ? grabBoxes.map(({ picked, rect: b }) => {
                    const on = selected?.set === picked.set && selected.part === picked.part;
                    const name = pickedName(picked);
                    return (
                      <div
                        key={`${picked.set}:${picked.part ?? "set"}`}
                        role="button"
                        aria-label={`Move ${name}`}
                        aria-pressed={on}
                        title={name}
                        className={`absolute rounded-sm touch-none cursor-move ${
                          on
                            ? "border-2 border-teal-600 bg-teal-600/10"
                            : picked.part
                              ? "border border-dashed border-amber-600 bg-amber-500/5 hover:bg-amber-500/15"
                              : "border border-dashed border-teal-600 bg-teal-600/5 hover:bg-teal-600/15"
                        }`}
                        style={{
                          left: `${((b.x - SET_PAD) / STICKER_W) * 100}%`,
                          top: `${((b.y - SET_PAD) / STICKER_H) * 100}%`,
                          width: `${((b.width + 2 * SET_PAD) / STICKER_W) * 100}%`,
                          height: `${((b.height + 2 * SET_PAD) / STICKER_H) * 100}%`,
                        }}
                        onPointerDown={(e) => onSetDown(picked, e)}
                        onPointerMove={onSetMove}
                        onPointerUp={onSetUp}
                        onPointerCancel={onSetUp}
                      >
                        {on ? (
                          <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-teal-600 px-1.5 text-[11px] leading-4 text-white">
                            {name}
                          </span>
                        ) : null}
                      </div>
                    );
                  })
                : null}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[12.5px] text-text-muted">
              <label className="inline-flex items-center gap-2">
                Zoom
                <input
                  type="range"
                  min={MIN_ZOOM}
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
                onClick={() => setPlacement(kept(fitPlacement(image.width, image.height)))}
              >
                Reset position
              </Button>
              {ratioOff ? (
                <Button size="sm" disabled={busy || stretched} onClick={() => setPlacement(kept(FULL_PLACEMENT))}>
                  Stretch to fit
                </Button>
              ) : null}
              <Button
                size="sm"
                variant={cropping ? "primary" : undefined}
                icon={<Crop className="size-3.5" />}
                disabled={busy}
                onClick={() => {
                  setCropping((c) => !c);
                  setArranging(false);
                  setSelected(null);
                }}
              >
                {cropping ? "Done cropping" : "Crop"}
              </Button>
              {cut ? (
                <Button size="sm" disabled={busy} onClick={() => setCrop(NO_CROP)}>
                  Remove crop
                </Button>
              ) : null}
              <Button
                size="sm"
                variant={arranging ? "primary" : undefined}
                icon={<Move className="size-3.5" />}
                disabled={busy}
                onClick={() => {
                  setArranging((a) => !a);
                  setCropping(false);
                  setSelected(null);
                }}
              >
                {arranging ? "Done moving" : "Move text & QR"}
              </Button>
              {arranging && selected && canSplit(selected.set) ? (
                isSplit(selected.set) ? (
                  <Button size="sm" icon={<Group className="size-3.5" />} disabled={busy} onClick={() => setSplit(selected.set, false)}>
                    Group again
                  </Button>
                ) : (
                  <Button size="sm" icon={<Ungroup className="size-3.5" />} disabled={busy} onClick={() => setSplit(selected.set, true)}>
                    Ungroup
                  </Button>
                )
              ) : null}
              {arranging && selected && selectedChanged ? (
                <Button size="sm" disabled={busy} onClick={() => putBack(selected.set)}>
                  Put this one back
                </Button>
              ) : null}
              {movedAny ? (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setLayout({});
                    setSelected((s) => (s ? { set: s.set, part: null } : s));
                  }}
                >
                  Put all text & QR back
                </Button>
              ) : null}
            </div>
            {arranging && selectedPieces.length ? (
              <div className="rounded-md border bg-surface-2 p-3 space-y-2">
                <div className="text-[12.5px] font-medium">
                  Words of {SET_NAMES[selected!.set]} — on the sticker only
                  <span className="font-normal text-text-muted">
                    {" "}
                    · the verification page keeps its own wording. Empty leaves the words off.
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {selectedPieces.map((p) => {
                    const value = pieceText(p, texts);
                    const changed = value !== p.text;
                    return (
                      <Field key={p.id} label={p.part === "value" ? `Value (as made: “${p.text}”)` : `Words (as made: “${p.text}”)`}>
                        <div className="flex gap-1.5">
                          <Input
                            value={value}
                            maxLength={MAX_PIECE_TEXT}
                            disabled={busy}
                            onChange={(e) => setTexts((t) => ({ ...t, [p.id]: e.target.value }))}
                          />
                          {changed ? (
                            <Button
                              size="sm"
                              disabled={busy}
                              title={`Back to “${p.text}”`}
                              onClick={() =>
                                setTexts((t) => {
                                  const next = { ...t };
                                  delete next[p.id];
                                  return next;
                                })
                              }
                            >
                              Restore
                            </Button>
                          ) : null}
                        </div>
                      </Field>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {arranging && rewordedAny ? (
              <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-text-muted">
                Some of the sticker&apos;s words are changed.
                <Button size="sm" disabled={busy} onClick={() => setTexts({})}>
                  Restore all words
                </Button>
              </div>
            ) : null}
            <p className="text-[12.5px] text-text-muted">
              {arranging
                ? selected && selectedOffset
                  ? `${pickedName(selected)}: moved ${Math.round(selectedOffset.dx)} across, ${Math.round(selectedOffset.dy)} down · drag it, or nudge it with the arrow keys by 1, with Shift by 10.${
                      canSplit(selected.set) && !isSplit(selected.set) ? " Ungroup to move its words and its value apart." : ""
                    }`
                  : "Click a value with its words, the QR code, the signature or the officer's name, and drag it where it belongs. The signature and the name under it move on their own. A picked value can be ungrouped from its words, and the words changed for the sticker."
                : cropping
                  ? `Drag the white handles on the image's edges to cut off what is not wanted; the faded part is cut off. Cut: top ${pct(crop.top)}, right ${pct(crop.right)}, bottom ${pct(crop.bottom)}, left ${pct(crop.left)}.`
                  : `Drag the image to move it in any direction · arrow keys nudge by 1, with Shift by 10 · left ${Math.round(placement.x)}, top ${Math.round(placement.y)}.`}{" "}
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
