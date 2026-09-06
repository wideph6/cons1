import { ApiError } from "./errors";

const HOSTNAME_RE =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** "https://Files.Example.com/x" -> "files.example.com" (throws on invalid). */
export function normalizeHostname(input: unknown): string {
  if (typeof input !== "string") throw new ApiError(400, "Domain is required");
  let h = input.trim().toLowerCase();
  h = h.replace(/^[a-z]+:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "").replace(/\.$/, "");
  if (h === "localhost" || /^localhost:\d+$/.test(h)) return "localhost";
  if (!HOSTNAME_RE.test(h)) {
    throw new ApiError(400, "Enter a valid domain or subdomain, for example files.example.com");
  }
  return h;
}

/** "/Reports//2025/" -> "Reports/2025". Empty string means the domain root. */
export function normalizePath(input: unknown): string {
  if (input === undefined || input === null) return "";
  if (typeof input !== "string") throw new ApiError(400, "Link path must be text");
  const raw = input.trim().replace(/\\/g, "/");
  const segments = raw
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const s of segments) {
    if (s === "." || s === "..") throw new ApiError(400, "Link path cannot contain . or .. segments");
    if (!/^[A-Za-z0-9._~-]+$/.test(s)) {
      throw new ApiError(400, "Link path can only use letters, numbers, - _ . ~ and / between parts");
    }
  }
  const path = segments.join("/");
  if (path.length > 300) throw new ApiError(400, "Link path is too long (max 300 characters)");
  return path;
}

/** Strip folders and unsafe characters from a file name; keep the extension. */
export function cleanFilename(input: unknown): string {
  if (typeof input !== "string") throw new ApiError(400, "File name is required");
  let f = input.trim().replace(/\\/g, "/");
  f = f.substring(f.lastIndexOf("/") + 1);
  f = f
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"|?*#%]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  if (!f) throw new ApiError(400, "File name is required");
  if (f.length > 200) throw new ApiError(400, "File name is too long (max 200 characters)");
  return f;
}

export function fileExtension(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i === -1 ? "" : filename.slice(i + 1).toLowerCase();
}

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  json: "application/json",
  zip: "application/zip",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
};

export function guessContentType(filename: string, hint?: string | null): string {
  const ext = fileExtension(filename);
  if (MIME[ext]) return MIME[ext];
  if (hint && /^[\w.+-]+\/[\w.+-]+/.test(hint)) return hint;
  return "application/octet-stream";
}

export function buildPublicUrl(hostname: string, path: string, filename: string): string {
  const segments = [...path.split("/").filter(Boolean), filename].map((s) => encodeURIComponent(s));
  return `https://${hostname}/${segments.join("/")}`;
}

export function buildLinkUrl(hostname: string, path: string): string {
  const segments = path.split("/").filter(Boolean).map((s) => encodeURIComponent(s));
  return `https://${hostname}/${segments.join("/")}${segments.length ? "/" : ""}`;
}

/** RFC 6266 Content-Disposition with ASCII fallback + UTF-8 name. */
export function contentDisposition(type: "attachment" | "inline", filename: string): string {
  const ascii = filename.replace(/[^\u0020-\u007e]/g, "_").replace(/["\\]/g, "_");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function formatBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} d ago`;
  return formatDateTime(iso);
}

export const ACTION_LABELS: Record<string, string> = {
  upload: "Uploaded",
  replace: "Replaced",
  rename: "Renamed",
  delete: "Deleted",
  create_link: "Created link",
  update_link: "Updated link",
  delete_link: "Deleted link",
  create_domain: "Added domain",
  update_domain: "Updated domain",
  delete_domain: "Deleted domain",
  create_user: "Created user",
  update_user: "Updated user",
  delete_user: "Deleted user",
  edit_counter: "Edited counter",
  change_password: "Changed password",
};

export function displayPath(path: string): string {
  return path ? `/${path}/` : "/";
}
