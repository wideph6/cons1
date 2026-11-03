"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type { MobileViewerMode, PageRecord } from "@/lib/new-m-page";
import { loadPdfjs } from "./PdfViewer";

type Doc = NonNullable<PageRecord["document"]>;

/**
 * The document panel of the mobile view. As in the mobile design it shows the file the way a phone's
 * browser does — a PDF icon, the file name and an Open button — or, when the super admin picks it, the
 * PDF's pages one under the other.
 */
export function MobilePdf({
  document: doc,
  mode,
  buttonText,
  buttonHidden,
  showFilename,
  preview,
  buttonProps,
  filenameProps,
}: {
  document: Doc | null;
  mode: MobileViewerMode;
  buttonText: string;
  buttonHidden?: boolean;
  showFilename: boolean;
  /** The editor: a sample file name, and nothing opens. */
  preview?: boolean;
  buttonProps?: { className?: string; "data-edit"?: string };
  filenameProps?: { className?: string; "data-edit"?: string };
}) {
  const [failed, setFailed] = useState(false);
  const usePages = mode === "pages" && doc && !failed;

  if (usePages) {
    return <PdfPages doc={doc} preview={preview} onFail={() => setFailed(true)} />;
  }

  const name = doc?.filename ?? (preview ? "document.pdf" : "");
  const href = doc?.open_url;
  return (
    <div className="nmpm-file">
      <span className="nmpm-file-icon" aria-hidden="true">
        PDF
      </span>
      {showFilename ? (
        <span {...filenameProps} className={["nmpm-file-name", filenameProps?.className ?? ""].join(" ").trim()}>
          {name || "No document is attached"}
        </span>
      ) : null}
      {!buttonHidden ? (
        href && !preview ? (
          <a {...buttonProps} className={["nmpm-file-open", buttonProps?.className ?? ""].join(" ").trim()} href={href} target="_blank" rel="noopener noreferrer">
            {buttonText}
          </a>
        ) : (
          <span {...buttonProps} className={["nmpm-file-open", buttonProps?.className ?? ""].join(" ").trim()} role={preview ? undefined : "link"} aria-disabled={!href}>
            {buttonText}
          </span>
        )
      ) : null}
    </div>
  );
}

/** Every page of the PDF at the panel's width, each drawn when it scrolls near. */
function PdfPages({ doc, preview, onFail }: { doc: Doc; preview?: boolean; onFail: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [ratios, setRatios] = useState<number[]>([]);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    // Hidden (the desktop view is showing) or not yet laid out: nothing is downloaded.
    if (!width) return;
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const p = await pdfjs.getDocument({ url: doc.src, disableAutoFetch: true, disableStream: true, rangeChunkSize: 262144 }).promise;
        loaded = p;
        if (cancelled) return void p.destroy();
        const first = (await p.getPage(1)).getViewport({ scale: 1 });
        const list = Array.from({ length: p.numPages }, () => first.height / first.width);
        setRatios(list);
        setPdf(p);
      } catch (e) {
        console.error("[mobile pdf]", e);
        if (!cancelled) onFail();
      }
    })();
    return () => {
      cancelled = true;
      if (loaded) void loaded.destroy();
    };
    // Loaded once the panel has a width; a later resize only redraws the pages.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.src, width > 0]);

  return (
    <div ref={root} className="nmpm-pages" aria-busy={!pdf}>
      {!pdf ? <span className="nmpm-pages-wait">Loading the document…</span> : null}
      {pdf && width
        ? ratios.map((r, i) => (
            <div key={i} className="nmpm-page" style={{ height: Math.round(width * r) }}>
              <PageImage pdf={pdf} page={i + 1} width={width} root={root} />
            </div>
          ))
        : null}
      {preview ? null : (
        <a className="nmpm-pages-open" href={doc.open_url} target="_blank" rel="noopener noreferrer">
          Open the PDF
        </a>
      )}
    </div>
  );
}

function PageImage({
  pdf,
  page,
  width,
  root,
}: {
  pdf: PDFDocumentProxy;
  page: number;
  width: number;
  root: React.RefObject<HTMLDivElement | null>;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(page <= 1);

  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setNear(true), { rootMargin: "100% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [near, root]);

  useEffect(() => {
    if (!near || !width) return;
    let task: RenderTask | null = null;
    let cancelled = false;
    (async () => {
      try {
        const proxy = await pdf.getPage(page);
        const canvas = ref.current;
        if (cancelled || !canvas) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const base = proxy.getViewport({ scale: 1 });
        const vp = proxy.getViewport({ scale: (width * dpr) / base.width });
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        task = proxy.render({ canvas, canvasContext: ctx, viewport: vp });
        await task.promise;
      } catch (e) {
        if ((e as { name?: string })?.name !== "RenderingCancelledException") console.error("[mobile pdf] page", page, e);
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, page, width, near]);

  return <canvas ref={ref} role="img" aria-label={`Page ${page}`} />;
}
