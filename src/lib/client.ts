"use client";

export class ClientError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ClientError";
    this.status = status;
  }
}

interface ApiInit {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  json?: unknown;
  body?: BodyInit;
  signal?: AbortSignal;
}

/** Fetch wrapper for the admin API. Throws ClientError with the server's message on failure. */
export async function api<T = unknown>(path: string, init: ApiInit = {}): Promise<T> {
  const headers = new Headers();
  let body: BodyInit | undefined = init.body;
  if (init.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.json);
  }
  const res = await fetch(path, {
    method: init.method ?? (init.json !== undefined ? "POST" : "GET"),
    headers,
    body,
    signal: init.signal,
    credentials: "same-origin",
    cache: "no-store",
  });

  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/login")) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login?next=${next}`;
    throw new ClientError(401, "Signed out");
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error ?? res.statusText ?? "Request failed";
    throw new ClientError(res.status, message);
  }
  return data as T;
}

/** PUT a file to a presigned URL with progress. Rejects with status 0 on network/CORS failure. */
export function putWithProgress(
  url: string,
  file: File,
  contentType: string,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new ClientError(xhr.status, `Storage rejected the upload (HTTP ${xhr.status})`));
    };
    xhr.onerror = () => reject(new ClientError(0, "Could not reach storage (network or CORS problem)"));
    xhr.onabort = () => reject(new ClientError(0, "Upload cancelled"));
    if (signal) {
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(file);
  });
}

/** POST multipart to our own server (fallback for small files when direct upload is blocked). */
export function postFormWithProgress<T>(
  url: string,
  form: FormData,
  onProgress: (fraction: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data: unknown = null;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else reject(new ClientError(xhr.status, (data as { error?: string } | null)?.error ?? `Upload failed (HTTP ${xhr.status})`));
    };
    xhr.onerror = () => reject(new ClientError(0, "Network error during upload"));
    xhr.send(form);
  });
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/** datetime-local input value -> ISO string (or undefined when empty). */
export function localToIso(v: string): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Triggers a browser download for an in-memory blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next tick so the click has already started the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadSvgFile(svg: string, filename: string): void {
  downloadBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), filename);
}

/**
 * Rasterises an SVG string to a PNG and saves it.
 *
 * The SVG must be fully self-contained: any <image> inside it has to be a data: URI, because an
 * external URL taints the canvas and makes toBlob return null on most browsers.
 */
export async function downloadSvgAsPng(svg: string, filename: string, scale = 3): Promise<void> {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("The certificate image could not be rendered"));
      el.src = url;
    });

    const width = Math.round((img.naturalWidth || 560) * scale);
    const height = Math.round((img.naturalHeight || 780) * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser cannot export the certificate");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("The certificate could not be converted to PNG");
    downloadBlob(png, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}
