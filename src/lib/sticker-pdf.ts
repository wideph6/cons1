"use client";

import { svgToPng } from "@/lib/client";

/**
 * Stickers as PDF files, and PDF files as sticker backgrounds. Browser only: PDF.js draws a PDF's first page
 * into an image the sticker editor works on like any other, and pdf-lib wraps a finished sticker into a
 * one-page PDF of the sticker's real size. Both libraries load only when they are needed.
 */

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

/** PDF.js and its worker, loaded once. */
function loadPdfjs(): Promise<typeof import("pdfjs-dist")> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs").then((lib) => {
      const pdfjs = lib as unknown as typeof import("pdfjs-dist");
      if (!pdfjs.GlobalWorkerOptions.workerPort) {
        pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url), {
          type: "module",
        });
      }
      return pdfjs;
    });
    pdfjsPromise.catch(() => {
      pdfjsPromise = null;
    });
  }
  return pdfjsPromise;
}

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/** The largest PDF read as a background; only its drawing is uploaded, never the PDF itself. */
export const MAX_PDF_BACKGROUND = 30 * 1024 * 1024;

/** The longer side of the image a PDF background is drawn as, in pixels: sharp when the sticker is printed. */
const PDF_LONG_SIDE = 3200;

export interface PdfBackground {
  /** The first page, drawn as an image ready to upload in the PDF's place. */
  file: File;
  /** Its pixel size. */
  width: number;
  height: number;
  /** The page's own size in points (1/72 inch), as the PDF gives it. */
  page: { width: number; height: number };
  /** How many pages the PDF has; only the first is used. */
  pages: number;
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Draws a PDF's first page as an image of at most maxBytes: a PNG when it fits, a high-quality JPEG
 * otherwise, and smaller only when even that is too big. The page is drawn on white, as it prints.
 */
export async function pdfToBackground(pdf: File, maxBytes: number): Promise<PdfBackground> {
  const pdfjs = await loadPdfjs();
  let doc: Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await pdf.arrayBuffer()) }).promise;
  } catch (e) {
    const name = (e as { name?: string })?.name;
    throw new Error(
      name === "PasswordException" ? "That PDF is password-protected. Choose one without a password." : "That PDF could not be opened.",
    );
  }
  try {
    const page = await doc.getPage(1);
    const points = page.getViewport({ scale: 1 });
    const base = pdf.name.replace(/\.pdf$/i, "") || "background";
    let scale = PDF_LONG_SIDE / Math.max(points.width, points.height);
    for (let attempt = 0; attempt < 5; attempt++) {
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("This browser cannot draw the PDF");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;

      const png = await canvasBlob(canvas, "image/png");
      const jpg = png && png.size <= maxBytes ? null : await canvasBlob(canvas, "image/jpeg", 0.93);
      const fit = png && png.size <= maxBytes ? png : jpg && jpg.size <= maxBytes ? jpg : null;
      if (fit) {
        const ext = fit.type === "image/png" ? "png" : "jpg";
        return {
          file: new File([fit], `${base}.${ext}`, { type: fit.type }),
          width: canvas.width,
          height: canvas.height,
          page: { width: points.width, height: points.height },
          pages: doc.numPages,
        };
      }
      scale *= 0.8;
    }
    throw new Error("That PDF's first page is too detailed to use as a background. Try a simpler PDF or an image.");
  } finally {
    void doc.destroy();
  }
}

/**
 * A sticker as a one-page PDF: the sticker drawn at `scale` times its size (as sharp as the PNG was) on
 * a page of the sticker's real size, `pointsPerUnit` points for every sticker unit.
 */
export async function stickerPdf(
  svg: string,
  size: { width: number; height: number },
  scale: number,
  pointsPerUnit: number,
  title: string,
): Promise<Blob> {
  const [png, { PDFDocument }] = await Promise.all([svgToPng(svg, scale), import("pdf-lib")]);
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setCreator("New M");
  const image = await doc.embedPng(new Uint8Array(await png.arrayBuffer()));
  const width = size.width * pointsPerUnit;
  const height = size.height * pointsPerUnit;
  const page = doc.addPage([width, height]);
  page.drawImage(image, { x: 0, y: 0, width, height });
  const bytes = await doc.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}
