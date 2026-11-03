"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import type { PageRecord, ViewerTool } from "@/lib/new-m-page";
import {
  IconDownload,
  IconDraw,
  IconFit,
  IconMenu,
  IconMinus,
  IconMore,
  IconPlus,
  IconPrint,
  IconRedo,
  IconRotate,
  IconShapes,
  IconText,
  IconUndo,
} from "./icons";

/**
 * The document viewer of the verification page, drawn after the browser's own PDF viewer as it appears
 * in the design: a dark toolbar, page thumbnails on the left and the pages on the right.
 *
 * PDF.js renders the pages, reading the file in pieces from /api/new-m/document so a large scan starts
 * showing before it has fully arrived. Notes and drawings a visitor adds stay in their browser; they
 * can be printed or saved into a copy of the PDF, and never change the stored document.
 */

type Doc = NonNullable<PageRecord["document"]>;

interface Props {
  document: Doc | null;
  tools: Record<ViewerTool, boolean>;
  sidebarOpen: boolean;
  /** The editor's preview: a sample page when there is no document, and nothing reacts to clicks. */
  preview?: boolean;
}

type Rotation = 0 | 90 | 180 | 270;
type Zoom = { mode: "width" } | { mode: "page" } | { mode: "factor"; value: number };
type Tool = "none" | "text" | "draw";

interface Size {
  w: number;
  h: number;
}

/** A pen stroke in page units (PDF points of the page as it is shown at rotation 0). */
interface Stroke {
  kind: "ink";
  id: string;
  page: number;
  color: string;
  width: number;
  points: Array<[number, number]>;
}

interface Note {
  kind: "text";
  id: string;
  page: number;
  x: number;
  y: number;
  size: number;
  color: string;
  text: string;
}

type Annot = Stroke | Note;

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 6;
const ZOOM_STEP = 1.2;
const PEN_COLORS = ["#111111", "#1a56db", "#c81e1e", "#057a55"];

/** Toolbar places, as centres in design pixels from the toolbar's left edge (measured from the design). */
const PLACES = {
  sidebar: 25.2,
  sep1: 90.4,
  zoomOut: 107.8,
  zoomIn: 134.7,
  sep2: 151.8,
  fit: 175.7,
  rotate: 202.1,
  sep3: 226.6,
  text: 245.6,
  draw: 272.6,
  sep4: 291.4,
  undo: 310.1,
  redo: 337,
  shapes: 381.1,
  download: 410.8,
  print: 441.2,
  more: 471.4,
} as const;

function u(n: number): string {
  return `calc(var(--u) * ${n})`;
}

function at(place: keyof typeof PLACES): CSSProperties {
  return { left: u(PLACES[place]) };
}

function icon(w: number, h = w): CSSProperties {
  return { width: u(w), height: u(h) };
}

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

/** PDF.js and its worker, loaded once and only in the browser. */
export function loadPdfjs(): Promise<typeof import("pdfjs-dist")> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs").then((lib) => {
      const pdfjs = lib as unknown as typeof import("pdfjs-dist");
      if (!pdfjs.GlobalWorkerOptions.workerPort) {
        pdfjs.GlobalWorkerOptions.workerPort = new Worker(
          new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url),
          { type: "module" },
        );
      }
      return pdfjs;
    });
    pdfjsPromise.catch(() => {
      pdfjsPromise = null;
    });
  }
  return pdfjsPromise;
}

const EMPTY_HISTORY = { past: [] as Annot[][], now: [] as Annot[], future: [] as Annot[][] };

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function formatBytes(n: number): string {
  if (!n) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/** The page's size on screen once turned. */
function turned(size: Size, rotation: Rotation): Size {
  return rotation % 180 ? { w: size.h, h: size.w } : size;
}

export function PdfViewer({ document: doc, tools, sidebarOpen, preview }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<Size[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(doc ? "loading" : "idle");
  const [error, setError] = useState<string | null>(null);

  const [side, setSide] = useState(sidebarOpen);
  const [zoom, setZoom] = useState<Zoom>({ mode: "width" });
  const [rotation, setRotation] = useState<Rotation>(0);
  const [pane, setPane] = useState<Size>({ w: 0, h: 0 });
  const [current, setCurrent] = useState(1);
  const [pageInput, setPageInput] = useState("1");

  const [tool, setTool] = useState<Tool>("none");
  const [penColor, setPenColor] = useState(PEN_COLORS[0]);
  /** The visitor's notes and drawings with their undo history, changed only through pure updates. */
  const [hist, setHist] = useState<{ past: Annot[][]; now: Annot[]; future: Annot[][] }>(EMPTY_HISTORY);
  const annots = hist.now;
  const [editingNote, setEditingNote] = useState<string | null>(null);
  /** Whether a note was being edited when the pointer went down, so that click only ends the edit. */
  const wasEditing = useRef(false);

  const [menu, setMenu] = useState<null | "more" | "pen">(null);
  const [props, setProps] = useState<null | Record<string, string>>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setSide(sidebarOpen), [sidebarOpen]);

  const say = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 3500);
  }, []);

  /* ---------- Loading the document ---------- */

  /**
   * Whether the viewer is on screen at all. The public page carries the desktop and the mobile view
   * together and shows one; the hidden one has no size, and never downloads the document.
   */
  const [shown, setShown] = useState(false);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const check = () => setShown(el.getClientRects().length > 0 && el.offsetWidth > 0);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!doc) {
      setPdf(null);
      setSizes([]);
      setStatus("idle");
      return;
    }
    if (!shown) return;
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    setStatus("loading");
    setError(null);
    setHist(EMPTY_HISTORY);
    setCurrent(1);
    setPageInput("1");
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const task = pdfjs.getDocument({
          url: doc.src,
          // Only the pieces a page needs are fetched, so the first page shows before a large scan has arrived.
          disableAutoFetch: true,
          disableStream: true,
          rangeChunkSize: 262144,
        });
        const p = await task.promise;
        loaded = p;
        if (cancelled) {
          void p.destroy();
          return;
        }
        const first = await p.getPage(1);
        const vp = first.getViewport({ scale: 1 });
        const base: Size = { w: vp.width, h: vp.height };
        // Every page starts with the first page's size and is corrected as it is opened, so a long
        // document lays out at once instead of waiting for every page.
        const list = Array.from({ length: p.numPages }, () => ({ ...base }));
        setSizes(list);
        setPdf(p);
        setStatus("ready");
        for (let i = 2; i <= p.numPages && i <= 60; i++) {
          if (cancelled) break;
          const pg = await p.getPage(i);
          const v = pg.getViewport({ scale: 1 });
          if (Math.abs(v.width - base.w) > 0.5 || Math.abs(v.height - base.h) > 0.5) {
            setSizes((prev) => {
              const next = prev.slice();
              next[i - 1] = { w: v.width, h: v.height };
              return next;
            });
          }
        }
      } catch (e) {
        if (cancelled) return;
        console.error("[pdf viewer]", e);
        setStatus("error");
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      if (loaded) void loaded.destroy();
    };
  }, [doc, shown]);

  /* ---------- Pane size and scale ---------- */

  useLayoutEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPane({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setPane({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const pageCount = preview && !doc ? 1 : sizes.length;
  const sampleSize: Size = { w: 595, h: 842 };
  const pageSizes = preview && !doc ? [sampleSize] : sizes;

  const scale = useMemo(() => {
    const ref = turned(pageSizes[Math.max(0, current - 1)] ?? pageSizes[0] ?? sampleSize, rotation);
    if (!pane.w || !ref.w) return 1;
    const widest = Math.max(...pageSizes.map((s) => turned(s, rotation).w), ref.w);
    const fitWidth = pane.w / widest;
    if (zoom.mode === "width") return fitWidth;
    if (zoom.mode === "page") return Math.min(pane.w / ref.w, (pane.h - 2) / ref.h);
    return fitWidth * zoom.value;
    // sampleSize is a constant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane, pageSizes, rotation, zoom, current]);

  /* ---------- Which page is showing ---------- */

  const pageEls = useRef<Array<HTMLDivElement | null>>([]);

  const onScroll = useCallback(() => {
    const el = mainRef.current;
    if (!el) return;
    const line = el.scrollTop + el.clientHeight * 0.3;
    let n = 1;
    for (let i = 0; i < pageEls.current.length; i++) {
      const p = pageEls.current[i];
      if (p && p.offsetTop <= line) n = i + 1;
    }
    setCurrent((c) => (c === n ? c : n));
  }, []);

  useEffect(() => setPageInput(String(current)), [current]);

  function goTo(n: number) {
    const target = Math.min(Math.max(1, Math.round(n)), Math.max(1, pageCount));
    const el = pageEls.current[target - 1];
    const main = mainRef.current;
    if (el && main) main.scrollTo({ top: el.offsetTop, behavior: "smooth" });
    setCurrent(target);
  }

  /* ---------- Annotations and history ---------- */

  /** One undoable step. An update that changes nothing adds no step. */
  function commit(fn: (list: Annot[]) => Annot[]) {
    setHist((h) => {
      const next = fn(h.now);
      if (next === h.now) return h;
      return { past: [...h.past.slice(-99), h.now], now: next, future: [] };
    });
  }

  function undo() {
    setEditingNote(null);
    setHist((h) => (h.past.length ? { past: h.past.slice(0, -1), now: h.past[h.past.length - 1], future: [h.now, ...h.future] } : h));
  }

  function redo() {
    setEditingNote(null);
    setHist((h) => (h.future.length ? { past: [...h.past, h.now], now: h.future[0], future: h.future.slice(1) } : h));
  }

  useEffect(() => {
    if (preview) return;
    const onKey = (e: KeyboardEvent) => {
      const root = rootRef.current;
      if (!root || !root.contains(document.activeElement)) return;
      if ((e.target as HTMLElement)?.isContentEditable || (e.target as HTMLElement)?.tagName === "INPUT") return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (e.key === "Escape") {
        setTool("none");
        setMenu(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  /* ---------- Toolbar actions ---------- */

  function zoomBy(step: number) {
    const ref = turned(pageSizes[current - 1] ?? sampleSize, rotation);
    const widest = Math.max(...pageSizes.map((s) => turned(s, rotation).w), ref.w);
    const fitWidth = pane.w / widest || 1;
    const now = scale / fitWidth;
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, step > 0 ? now * ZOOM_STEP : now / ZOOM_STEP));
    setZoom(Math.abs(next - 1) < 0.02 ? { mode: "width" } : { mode: "factor", value: next });
  }

  function toggleFit() {
    setZoom((z) => (z.mode === "page" ? { mode: "width" } : { mode: "page" }));
  }

  function rotate(dir: 1 | -1) {
    setRotation((r) => (((r + dir * 90 + 360) % 360) as Rotation));
  }

  function pickTool(t: Tool) {
    setMenu(null);
    setEditingNote(null);
    setTool((cur) => (cur === t ? "none" : t));
  }

  function download() {
    if (!doc) return;
    const a = window.document.createElement("a");
    a.href = doc.download_url;
    a.rel = "noopener";
    window.document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /** The original PDF, as bytes, for printing and saving a copy with notes. */
  const bytesRef = useRef<Uint8Array | null>(null);
  async function originalBytes(): Promise<Uint8Array> {
    if (bytesRef.current) return bytesRef.current;
    if (!doc) throw new Error("No document");
    const res = await fetch(doc.src, { cache: "force-cache" });
    if (!res.ok) throw new Error(`The document could not be read (HTTP ${res.status})`);
    bytesRef.current = new Uint8Array(await res.arrayBuffer());
    return bytesRef.current;
  }
  useEffect(() => {
    bytesRef.current = null;
  }, [doc]);

  /** Saves a copy of the PDF with the visitor's notes and drawings written into it. */
  async function saveCopy() {
    if (!doc || !pdf) return;
    if (!annots.length) {
      download();
      return;
    }
    setBusy(true);
    try {
      const [{ PDFDocument, StandardFonts, rgb, LineCapStyle }, bytes] = await Promise.all([
        import("pdf-lib"),
        originalBytes(),
      ]);
      const out = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const font = await out.embedFont(StandardFonts.Helvetica);
      const skipped: string[] = [];
      const color = (hex: string) => {
        const n = parseInt(hex.slice(1), 16);
        return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
      };
      for (const a of annots) {
        const page = out.getPage(a.page - 1);
        const proxy = await pdf.getPage(a.page);
        const vp = proxy.getViewport({ scale: 1 });
        const toPdf = (x: number, y: number) => vp.convertToPdfPoint(x, y) as [number, number];
        if (a.kind === "ink") {
          for (let i = 1; i < a.points.length; i++) {
            const [x1, y1] = toPdf(...a.points[i - 1]);
            const [x2, y2] = toPdf(...a.points[i]);
            page.drawLine({
              start: { x: x1, y: y1 },
              end: { x: x2, y: y2 },
              thickness: a.width,
              color: color(a.color),
              lineCap: LineCapStyle.Round,
            });
          }
        } else if (a.text.trim()) {
          const lines = a.text.split("\n");
          lines.forEach((line, i) => {
            const [x, y] = toPdf(a.x + a.size * 0.2, a.y + a.size * (1.02 + i * 1.2));
            try {
              page.drawText(line, { x, y, size: a.size, font, color: color(a.color) });
            } catch {
              skipped.push(line);
            }
          });
        }
      }
      const saved = await out.save();
      const blob = new Blob([saved as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = doc.filename.replace(/\.pdf$/i, "") + " (with notes).pdf";
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      if (skipped.length) say("Some text uses letters the PDF's standard font cannot hold and was left out of the copy.");
    } catch (e) {
      console.error("[pdf viewer] save copy", e);
      say("The copy could not be made. Download the original instead.");
    } finally {
      setBusy(false);
    }
  }

  /** Prints every page as it looks here, notes and drawings included. */
  async function print() {
    if (!pdf) return;
    setBusy(true);
    try {
      const images: string[] = [];
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);
        const vp = page.getViewport({ scale: 2 });
        const canvas = window.document.createElement("canvas");
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("This browser cannot print the document");
        await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
        drawAnnots(ctx, annots.filter((a) => a.page === n), 2);
        images.push(canvas.toDataURL("image/jpeg", 0.92));
        page.cleanup();
      }
      const frame = window.document.createElement("iframe");
      frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
      window.document.body.appendChild(frame);
      const fdoc = frame.contentDocument;
      if (!fdoc || !frame.contentWindow) throw new Error("Printing is blocked in this browser");
      fdoc.open();
      fdoc.write(
        `<!doctype html><html><head><title>${escapeHtml(doc?.filename ?? "Document")}</title><style>@page{margin:0}html,body{margin:0;padding:0}img{display:block;width:100%;height:auto;page-break-after:always;break-after:page}img:last-child{page-break-after:auto;break-after:auto}</style></head><body>${images
          .map((src) => `<img src="${src}">`)
          .join("")}</body></html>`,
      );
      fdoc.close();
      await Promise.all(
        Array.from(fdoc.images).map((img) => (img.complete ? Promise.resolve() : new Promise((r) => (img.onload = img.onerror = r)))),
      );
      frame.contentWindow.focus();
      frame.contentWindow.print();
      window.setTimeout(() => frame.remove(), 60_000);
    } catch (e) {
      console.error("[pdf viewer] print", e);
      say("The document could not be printed here. Open it and print from there instead.");
    } finally {
      setBusy(false);
    }
  }

  async function showProperties() {
    setMenu(null);
    if (!doc) return;
    const info: Record<string, string> = {
      "File name": doc.filename,
      "File size": formatBytes(doc.size),
      Pages: String(pdf?.numPages ?? pageCount),
    };
    if (sizes[0]) {
      const mm = (pt: number) => Math.round((pt / 72) * 25.4);
      info["Page size"] = `${mm(sizes[0].w)} × ${mm(sizes[0].h)} mm`;
    }
    try {
      const meta = await pdf?.getMetadata();
      const m = (meta?.info ?? {}) as Record<string, unknown>;
      for (const [k, label] of [
        ["Title", "Title"],
        ["Author", "Author"],
        ["Subject", "Subject"],
        ["Creator", "Application"],
        ["Producer", "PDF producer"],
        ["PDFFormatVersion", "PDF version"],
      ] as const) {
        if (typeof m[k] === "string" && m[k]) info[label] = m[k] as string;
      }
    } catch {
      // The basics above are enough.
    }
    setProps(info);
  }

  function present() {
    setMenu(null);
    const el = rootRef.current;
    if (!el) return;
    if (window.document.fullscreenElement) void window.document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => say("Full screen is not available here."));
  }

  /* ---------- Drawing on a page ---------- */

  const drawing = useRef<Stroke | null>(null);
  const [liveStroke, setLiveStroke] = useState<Stroke | null>(null);

  function pagePoint(e: { clientX: number; clientY: number }, sheet: HTMLElement, size: Size): [number, number] {
    const rect = sheet.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const t = (-rotation * Math.PI) / 180;
    const px = dx * Math.cos(t) - dy * Math.sin(t);
    const py = dx * Math.sin(t) + dy * Math.cos(t);
    return [
      Math.min(size.w, Math.max(0, px / scale + size.w / 2)),
      Math.min(size.h, Math.max(0, py / scale + size.h / 2)),
    ];
  }

  function onLayerDown(e: React.PointerEvent<HTMLDivElement>, page: number, size: Size) {
    if (preview || tool === "none") return;
    const sheet = e.currentTarget.parentElement as HTMLElement;
    const pt = pagePoint(e, sheet, size);
    if (tool === "draw") {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      drawing.current = { kind: "ink", id: newId(), page, color: penColor, width: 1.6, points: [pt] };
      setLiveStroke(drawing.current);
    } else if (tool === "text") {
      wasEditing.current = editingNote !== null;
    }
  }

  /** With the text tool, a click on the page starts a note there; a click that ends an edit does only that. */
  function onLayerClick(e: React.MouseEvent<HTMLDivElement>, page: number, size: Size) {
    if (preview || tool !== "text") return;
    if ((e.target as HTMLElement).closest(".nmv-note")) return;
    if (wasEditing.current) {
      wasEditing.current = false;
      return;
    }
    const sheet = e.currentTarget.parentElement as HTMLElement;
    const pt = pagePoint(e, sheet, size);
    const note: Note = { kind: "text", id: newId(), page, x: pt[0], y: Math.max(0, pt[1] - 8), size: 12, color: penColor, text: "" };
    commit((list) => [...list, note]);
    setEditingNote(note.id);
  }

  function onLayerMove(e: React.PointerEvent<HTMLDivElement>, size: Size) {
    const s = drawing.current;
    if (!s) return;
    const sheet = e.currentTarget.parentElement as HTMLElement;
    const pt = pagePoint(e, sheet, size);
    const last = s.points[s.points.length - 1];
    if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) < 0.6) return;
    s.points.push(pt);
    setLiveStroke({ ...s, points: s.points.slice() });
  }

  function onLayerUp() {
    const s = drawing.current;
    drawing.current = null;
    setLiveStroke(null);
    if (s && s.points.length > 1) commit((list) => [...list, s]);
  }

  function finishNote(id: string, text: string) {
    setEditingNote((cur) => (cur === id ? null : cur));
    if (!text.trim()) {
      // An empty note is dropped, together with the step that made it when that was the last step.
      setHist((h) => {
        if (!h.now.some((a) => a.id === id)) return h;
        const now = h.now.filter((a) => a.id !== id);
        const prev = h.past[h.past.length - 1];
        if (prev && !prev.some((a) => a.id === id) && prev.length === now.length) {
          return { past: h.past.slice(0, -1), now: prev, future: h.future };
        }
        return { ...h, now };
      });
      return;
    }
    setHist((h) => {
      const note = h.now.find((a) => a.id === id);
      if (!note || note.kind !== "text" || note.text === text) return h;
      const now = h.now.map((a) => (a.id === id ? { ...note, text } : a));
      // The first words of a new note belong to the step that placed it, so one Undo takes the whole note away.
      const prev = h.past[h.past.length - 1];
      if (note.text === "" && prev && !prev.some((a) => a.id === id)) return { past: h.past, now, future: [] };
      return { past: [...h.past.slice(-99), h.now], now, future: [] };
    });
  }

  /* ---------- Rendering ---------- */

  const hasDoc = Boolean(doc) && status === "ready" && pdf;
  const canAct = Boolean(hasDoc) && !preview;
  const show = (k: ViewerTool) => tools[k] !== false;
  const sepAfter = (left: ViewerTool[], right: ViewerTool[]) => left.some(show) && right.some(show);

  return (
    <div
      ref={rootRef}
      className={`nmv tool-${tool}`}
      tabIndex={-1}
      onMouseDown={(e) => {
        if (menu && !(e.target as HTMLElement).closest(".nmv-menu, [data-menu]")) setMenu(null);
      }}
    >
      <div className="nmv-bar" role="toolbar" aria-label="Document tools">
        {show("sidebar") ? (
          <button
            type="button"
            className="nmv-btn is-narrow"
            style={at("sidebar")}
            onClick={() => setSide((s) => !s)}
            title={side ? "Hide page thumbnails" : "Show page thumbnails"}
            aria-label="Page thumbnails"
            aria-pressed={side}
          >
            <IconMenu style={icon(13.1)} />
          </button>
        ) : null}
        {show("pages") ? (
          <div className="nmv-pages">
            <input
              type="text"
              inputMode="numeric"
              aria-label="Page number"
              value={pageInput}
              disabled={preview}
              onChange={(e) => setPageInput(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
              onKeyDown={(e) => {
                if (e.key === "Enter") goTo(Number(pageInput) || current);
              }}
              onBlur={() => setPageInput(String(current))}
            />
            <span className="nmv-pages-of">/ {Math.max(1, pageCount)}</span>
          </div>
        ) : null}
        {sepAfter(["sidebar", "pages"], ["zoom", "fit", "rotate", "text", "draw", "history"]) ? (
          <span className="nmv-sep" style={at("sep1")} />
        ) : null}
        {show("zoom") ? (
          <>
            <button type="button" className="nmv-btn" style={at("zoomOut")} onClick={() => zoomBy(-1)} disabled={!hasDoc && !preview} title="Zoom out" aria-label="Zoom out">
              <IconMinus style={icon(13.7)} />
            </button>
            <button type="button" className="nmv-btn" style={at("zoomIn")} onClick={() => zoomBy(1)} disabled={!hasDoc && !preview} title="Zoom in" aria-label="Zoom in">
              <IconPlus style={icon(13.3)} />
            </button>
          </>
        ) : null}
        {sepAfter(["zoom"], ["fit", "rotate"]) ? <span className="nmv-sep" style={at("sep2")} /> : null}
        {show("fit") ? (
          <button
            type="button"
            className="nmv-btn"
            style={at("fit")}
            onClick={toggleFit}
            disabled={!hasDoc && !preview}
            title={zoom.mode === "page" ? "Fit to width" : "Fit to page"}
            aria-label={zoom.mode === "page" ? "Fit to width" : "Fit to page"}
          >
            <IconFit style={icon(15)} />
          </button>
        ) : null}
        {show("rotate") ? (
          <button type="button" className="nmv-btn" style={at("rotate")} onClick={() => rotate(-1)} disabled={!hasDoc && !preview} title="Rotate counterclockwise" aria-label="Rotate counterclockwise">
            <IconRotate style={icon(17)} />
          </button>
        ) : null}
        {sepAfter(["zoom", "fit", "rotate"], ["text", "draw"]) ? <span className="nmv-sep" style={at("sep3")} /> : null}
        {show("text") ? (
          <button
            type="button"
            className={`nmv-btn${tool === "text" ? " is-on" : ""}`}
            style={at("text")}
            onClick={() => pickTool("text")}
            disabled={!canAct}
            title="Add text"
            aria-label="Add text"
            aria-pressed={tool === "text"}
          >
            <IconText style={icon(16.3, 14.5)} />
          </button>
        ) : null}
        {show("draw") ? (
          <button
            type="button"
            className={`nmv-btn${tool === "draw" ? " is-on" : ""}`}
            style={at("draw")}
            data-menu
            onClick={() => {
              if (tool === "draw") setMenu((m) => (m === "pen" ? null : "pen"));
              else pickTool("draw");
            }}
            disabled={!canAct}
            title="Draw (click again for pen colours)"
            aria-label="Draw"
            aria-pressed={tool === "draw"}
          >
            <IconDraw style={icon(14.8)} />
          </button>
        ) : null}
        {sepAfter(["text", "draw"], ["history"]) ? <span className="nmv-sep" style={at("sep4")} /> : null}
        {show("history") ? (
          <>
            <button type="button" className="nmv-btn" style={at("undo")} onClick={undo} disabled={!canAct || !hist.past.length} title="Undo" aria-label="Undo">
              <IconUndo style={icon(14.1)} />
            </button>
            <button type="button" className="nmv-btn" style={at("redo")} onClick={redo} disabled={!canAct || !hist.future.length} title="Redo" aria-label="Redo">
              <IconRedo style={icon(14.1)} />
            </button>
          </>
        ) : null}
        {show("shapes") ? (
          <button
            type="button"
            className="nmv-btn"
            style={at("shapes")}
            onClick={saveCopy}
            disabled={!canAct || busy}
            title="Save a copy with your notes and drawings"
            aria-label="Save a copy with your notes and drawings"
          >
            <IconShapes style={icon(16.3)} />
          </button>
        ) : null}
        {show("download") ? (
          <button type="button" className="nmv-btn" style={at("download")} onClick={download} disabled={!doc || preview} title="Download" aria-label="Download">
            <IconDownload style={icon(13.4)} />
          </button>
        ) : null}
        {show("print") ? (
          <button type="button" className="nmv-btn" style={at("print")} onClick={print} disabled={!canAct || busy} title="Print" aria-label="Print">
            <IconPrint style={icon(15, 13.3)} />
          </button>
        ) : null}
        {show("more") ? (
          <button
            type="button"
            className="nmv-btn"
            style={at("more")}
            data-menu
            onClick={() => setMenu((m) => (m === "more" ? null : "more"))}
            disabled={!hasDoc || preview}
            title="More actions"
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={menu === "more"}
          >
            <IconMore style={icon(13.2)} />
          </button>
        ) : null}

        {menu === "more" ? (
          <div className="nmv-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => (setMenu(null), rotate(1))}>
              Rotate clockwise
            </button>
            <button type="button" role="menuitem" onClick={() => (setMenu(null), rotate(-1))}>
              Rotate counterclockwise
            </button>
            <hr />
            <button type="button" role="menuitem" onClick={() => (setMenu(null), setZoom({ mode: "page" }))}>
              Fit to page
            </button>
            <button type="button" role="menuitem" onClick={() => (setMenu(null), setZoom({ mode: "width" }))}>
              Fit to width
            </button>
            <hr />
            <button type="button" role="menuitem" onClick={() => (setMenu(null), window.open(doc?.open_url, "_blank", "noopener"))}>
              Open in new tab
            </button>
            <button type="button" role="menuitem" onClick={present}>
              Present (full screen)
            </button>
            {annots.length ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(null);
                  commit((list) => (list.length ? [] : list));
                }}
              >
                Clear my notes and drawings
              </button>
            ) : null}
            <hr />
            <button type="button" role="menuitem" onClick={showProperties}>
              Document properties
            </button>
          </div>
        ) : null}
        {menu === "pen" ? (
          <div className="nmv-menu is-left" role="menu" style={{ left: u(PLACES.draw - 20) }}>
            {PEN_COLORS.map((c) => (
              <button key={c} type="button" role="menuitemradio" aria-checked={penColor === c} onClick={() => (setPenColor(c), setMenu(null))}>
                <span className="nmv-swatch" style={{ background: c }} />
                {c === PEN_COLORS[0] ? "Black" : c === PEN_COLORS[1] ? "Blue" : c === PEN_COLORS[2] ? "Red" : "Green"}
                {penColor === c ? " ✓" : ""}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="nmv-body">
        {side && show("sidebar") ? (
          <aside className="nmv-side" aria-label="Pages">
            <div className="nmv-thumbs">
              {pageSizes.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  className={`nmv-thumb${current === i + 1 ? " is-current" : ""}`}
                  onClick={() => goTo(i + 1)}
                  aria-label={`Page ${i + 1}`}
                  aria-current={current === i + 1 ? "page" : undefined}
                >
                  <span className="nmv-thumb-page" style={{ aspectRatio: `${turned(s, rotation).w} / ${turned(s, rotation).h}` }}>
                    {hasDoc ? <Thumb pdf={pdf} page={i + 1} rotation={rotation} /> : <span className="nmv-blank" />}
                  </span>
                  <span>{i + 1}</span>
                </button>
              ))}
            </div>
          </aside>
        ) : null}

        <div ref={mainRef} className="nmv-main" onScroll={onScroll}>
          {status === "loading" ? (
            <div className="nmv-status">
              <span className="nmv-spinner" aria-hidden="true" />
              <span>Loading the document…</span>
            </div>
          ) : null}
          {status === "error" ? (
            <div className="nmv-status">
              <span>The document could not be shown here.</span>
              {doc ? (
                <a href={doc.open_url} target="_blank" rel="noopener noreferrer">
                  Open the document
                </a>
              ) : null}
              {error && process.env.NODE_ENV !== "production" ? <small>{error}</small> : null}
            </div>
          ) : null}
          {status === "idle" && !preview ? (
            <div className="nmv-status">
              <span>No document is attached to this record.</span>
            </div>
          ) : null}

          {(hasDoc || (preview && !doc)) && pane.w ? (
            <div className="nmv-stack">
              {pageSizes.map((s, i) => {
                const shown = turned(s, rotation);
                const w = s.w * scale;
                const h = s.h * scale;
                return (
                  <div
                    key={i}
                    ref={(el) => {
                      pageEls.current[i] = el;
                    }}
                    className="nmv-page"
                    style={{ width: shown.w * scale, height: shown.h * scale }}
                    data-page={i + 1}
                  >
                    <div
                      className="nmv-sheet"
                      style={{ width: w, height: h, transform: `translate(-50%, -50%) rotate(${rotation}deg)` }}
                    >
                      {hasDoc ? (
                        <PageCanvas pdf={pdf} page={i + 1} scale={scale} root={mainRef} />
                      ) : (
                        <span className="nmv-blank">
                          <span>The document&apos;s PDF shows here</span>
                        </span>
                      )}
                      <svg className="nmv-ink" viewBox={`0 0 ${s.w} ${s.h}`} preserveAspectRatio="none" aria-hidden="true">
                        {[...annots, ...(liveStroke ? [liveStroke] : [])]
                          .filter((a): a is Stroke => a.kind === "ink" && a.page === i + 1)
                          .map((a) => (
                            <polyline
                              key={a.id}
                              points={a.points.map((p) => p.join(",")).join(" ")}
                              fill="none"
                              stroke={a.color}
                              strokeWidth={a.width}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          ))}
                      </svg>
                      <div
                        className="nmv-layer"
                        onPointerDown={(e) => onLayerDown(e, i + 1, s)}
                        onClick={(e) => onLayerClick(e, i + 1, s)}
                        onPointerMove={(e) => onLayerMove(e, s)}
                        onPointerUp={onLayerUp}
                        onPointerCancel={onLayerUp}
                      >
                        {annots
                          .filter((a): a is Note => a.kind === "text" && a.page === i + 1)
                          .map((a) => (
                            <NoteBox
                              // A new key whenever the saved text changes, so React never fights the browser over typed text.
                              key={`${a.id}:${a.text}`}
                              note={a}
                              scale={scale}
                              editing={editingNote === a.id}
                              onEdit={() => tool === "text" && setEditingNote(a.id)}
                              onDone={(text) => finishNote(a.id, text)}
                            />
                          ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        {props ? (
          <div className="nmv-dialog" role="dialog" aria-modal="true" aria-label="Document properties" onMouseDown={(e) => e.target === e.currentTarget && setProps(null)}>
            <div className="nmv-dialog-box">
              <h3>Document properties</h3>
              <dl>
                {Object.entries(props).map(([k, v]) => (
                  <div key={k} style={{ display: "contents" }}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="nmv-dialog-actions">
                <button type="button" onClick={() => setProps(null)} autoFocus>
                  Close
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {toast ? (
          <div className="nmv-toast" role="status">
            {toast}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

/** Draws notes and strokes onto a page image (scale = canvas pixels per page unit). */
function drawAnnots(ctx: CanvasRenderingContext2D, list: Annot[], scale: number) {
  for (const a of list) {
    if (a.kind === "ink") {
      ctx.strokeStyle = a.color;
      ctx.lineWidth = a.width * scale;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      a.points.forEach(([x, y], i) => (i ? ctx.lineTo(x * scale, y * scale) : ctx.moveTo(x * scale, y * scale)));
      ctx.stroke();
    } else {
      ctx.fillStyle = a.color;
      ctx.font = `${a.size * scale}px Helvetica, Arial, sans-serif`;
      ctx.textBaseline = "alphabetic";
      a.text.split("\n").forEach((line, i) => {
        ctx.fillText(line, (a.x + a.size * 0.2) * scale, (a.y + a.size * (1.02 + i * 1.2)) * scale);
      });
    }
  }
}

/** One note placed by the visitor; editable in place while the text tool is on. */
function NoteBox({
  note,
  scale,
  editing,
  onEdit,
  onDone,
}: {
  note: Note;
  scale: number;
  editing: boolean;
  onEdit: () => void;
  onDone: (text: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!editing || !el) return;
    // After the click that opened it has finished moving focus around.
    const frame = window.requestAnimationFrame(() => {
      el.focus();
      const range = window.document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editing]);
  return (
    <div
      ref={ref}
      className="nmv-note"
      contentEditable={editing}
      suppressContentEditableWarning
      style={{ left: note.x * scale, top: note.y * scale, fontSize: note.size * scale, color: note.color }}
      onPointerDown={(e) => {
        if (editing) e.stopPropagation();
      }}
      onDoubleClick={onEdit}
      onBlur={(e) => editing && onDone(e.currentTarget.innerText.replace(/\n$/, ""))}
      onKeyDown={(e) => {
        if (e.key === "Escape") (e.currentTarget as HTMLDivElement).blur();
      }}
    >
      {note.text}
    </div>
  );
}

/**
 * One page, drawn when it comes near the visible part of the pane and drawn again when the zoom
 * changes. Drawn at the screen's pixel density, within a pixel budget so a deep zoom on a phone-sized
 * GPU does not fail.
 */
function PageCanvas({
  pdf,
  page,
  scale,
  root,
}: {
  pdf: PDFDocumentProxy;
  page: number;
  scale: number;
  root: React.RefObject<HTMLDivElement | null>;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(page <= 2);

  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNear(true);
      },
      { root: root.current, rootMargin: "150% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near, root]);

  useEffect(() => {
    if (!near) return;
    let task: RenderTask | null = null;
    let proxy: PDFPageProxy | null = null;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        proxy = await pdf.getPage(page);
        if (cancelled) return;
        const canvas = ref.current;
        if (!canvas) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const base = proxy.getViewport({ scale: 1 });
        let px = scale * dpr;
        const budget = 16_000_000;
        if (base.width * base.height * px * px > budget) px = Math.sqrt(budget / (base.width * base.height));
        const vp = proxy.getViewport({ scale: px });
        const off = window.document.createElement("canvas");
        off.width = Math.max(1, Math.floor(vp.width));
        off.height = Math.max(1, Math.floor(vp.height));
        const ctx = off.getContext("2d");
        if (!ctx) return;
        task = proxy.render({ canvas: off, canvasContext: ctx, viewport: vp });
        await task.promise;
        if (cancelled) return;
        // Drawn off screen first and copied in one go, so a zoom never shows a half-drawn page.
        canvas.width = off.width;
        canvas.height = off.height;
        canvas.getContext("2d")?.drawImage(off, 0, 0);
      } catch (e) {
        if ((e as { name?: string })?.name !== "RenderingCancelledException") console.error("[pdf viewer] page", page, e);
      }
    }, 60);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      task?.cancel();
    };
  }, [pdf, page, scale, near]);

  return <canvas ref={ref} aria-label={`Page ${page}`} role="img" />;
}

/** A page thumbnail, drawn once when it scrolls into the sidebar. */
function Thumb({ pdf, page, rotation }: { pdf: PDFDocumentProxy; page: number; rotation: Rotation }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [seen, setSeen] = useState(page <= 3);

  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setSeen(true), {
      rootMargin: "200px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  useEffect(() => {
    if (!seen) return;
    let task: RenderTask | null = null;
    let cancelled = false;
    (async () => {
      try {
        const proxy = await pdf.getPage(page);
        const canvas = ref.current;
        if (cancelled || !canvas) return;
        const width = Math.max(40, canvas.clientWidth || 95);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const base = proxy.getViewport({ scale: 1, rotation: (proxy.rotate + rotation) % 360 });
        const vp = proxy.getViewport({ scale: (width * dpr) / base.width, rotation: (proxy.rotate + rotation) % 360 });
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        task = proxy.render({ canvas, canvasContext: ctx, viewport: vp });
        await task.promise;
      } catch (e) {
        if ((e as { name?: string })?.name !== "RenderingCancelledException") console.error("[pdf viewer] thumbnail", page, e);
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, page, rotation, seen]);

  return <canvas ref={ref} />;
}
