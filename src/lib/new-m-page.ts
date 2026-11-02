/**
 * The New M verification page: what it says, where each piece links to, and which logos it shows.
 *
 * The super admin edits all of it from New M → Page design. The text, links and settings are saved in
 * the database (new_m_page_settings, one row per view); uploaded logos are saved in R2 under
 * new-m/page/ and only their storage keys are kept here. Everything has a default taken from the
 * reference design, so a page that was never edited already looks like it.
 *
 * No server imports: the editor, the public page and the API all read and check content with this file.
 */

export type PageView = "desktop" | "mobile";
export const PAGE_VIEWS: PageView[] = ["desktop", "mobile"];

/** Small icons a link or button can carry after its text. */
export type LinkIcon = "none" | "arrow" | "shield";
export const LINK_ICONS: { value: LinkIcon; label: string }[] = [
  { value: "none", label: "No icon" },
  { value: "arrow", label: "Arrow ↗" },
  { value: "shield", label: "Shield with tick" },
];

export type SocialIcon =
  | "x"
  | "facebook"
  | "linkedin"
  | "threads"
  | "instagram"
  | "youtube"
  | "tiktok"
  | "whatsapp"
  | "telegram"
  | "website";

export const SOCIAL_ICONS: { value: SocialIcon; label: string }[] = [
  { value: "x", label: "X (Twitter)" },
  { value: "facebook", label: "Facebook" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "threads", label: "Threads" },
  { value: "instagram", label: "Instagram" },
  { value: "youtube", label: "YouTube" },
  { value: "tiktok", label: "TikTok" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telegram", label: "Telegram" },
  { value: "website", label: "Website" },
];

export interface PText {
  text: string;
  hidden: boolean;
}

export interface PLinkText extends PText {
  href: string;
  new_tab: boolean;
}

export interface PLink {
  id: string;
  text: string;
  href: string;
  new_tab: boolean;
  hidden: boolean;
  icon: LinkIcon;
  /** Width in design pixels (the page is drawn on a 1062 px wide grid and scaled). Null = as wide as the text. */
  width: number | null;
}

export interface PSocial {
  id: string;
  icon: SocialIcon;
  label: string;
  href: string;
  new_tab: boolean;
  hidden: boolean;
}

/** A logo. key is the R2 object (new-m/page/...); null shows the built-in emblem. */
export interface PImage {
  key: string | null;
  content_type: string | null;
  filename: string | null;
  alt: string;
  href: string;
  new_tab: boolean;
  hidden: boolean;
}

/** Buttons of the PDF viewer's toolbar, left to right. */
export const VIEWER_TOOLS = [
  { key: "sidebar", label: "Thumbnails (☰)" },
  { key: "pages", label: "Page number" },
  { key: "zoom", label: "Zoom out / in (− +)" },
  { key: "fit", label: "Fit to page / width" },
  { key: "rotate", label: "Rotate" },
  { key: "text", label: "Add text (Tт)" },
  { key: "draw", label: "Draw" },
  { key: "history", label: "Undo / redo" },
  { key: "shapes", label: "Save a copy with notes (triangle +)" },
  { key: "download", label: "Download" },
  { key: "print", label: "Print" },
  { key: "more", label: "More (⋮)" },
] as const;
export type ViewerTool = (typeof VIEWER_TOOLS)[number]["key"];

export interface DesktopContent {
  /** The browser tab's title, and whether the page animates as it opens. */
  meta: { title: string; animations: boolean };
  header: {
    logo: PImage;
    title: PLinkText;
    subtitle: PText;
    top_links: PLink[];
    connect: PText;
    social: PSocial[];
  };
  nav: { items: PLink[] };
  hero: {
    crumbs: PLink[];
    crumb_current: PText;
    eyebrow: PText;
    title: PText;
    title_accent: PText;
    lead: PText;
    art: { hidden: boolean };
  };
  result: {
    found_title: PText;
    document_label: PText;
    issued_label: PText;
    missing_title: PText;
    missing_text: PText;
  };
  record: {
    eyebrow: PText;
    title: PText;
    logo: PImage;
    cert_title: PText;
    cert_subtitle: PText;
    labels: {
      attestation_number: PText;
      issue_date: PText;
      document_type: PText;
      issuing_office: PText;
      issuing_authority: PText;
      officer: PText;
    };
    designation: { hidden: boolean };
    signature: { hidden: boolean };
    disclaimer: PText;
  };
  document: {
    eyebrow: PText;
    title: PText;
    open: PLink;
    viewer: { sidebar_open: boolean; tools: Record<ViewerTool, boolean> };
  };
  cta: {
    button: PLink;
    help_before: PText;
    email: PLink;
    help_after: PText;
  };
  footer: {
    title: PText;
    visit: PLink;
    logo: PImage;
    brand_title: PLinkText;
    brand_subtitle: PText;
    left_links: PLink[];
    rows: PLink[][];
    copyright: PText;
    powered: PLink;
  };
}

/** The mobile view gets its own design later; until then it only remembers that it exists. */
export interface MobileContent {
  note: string;
}

export const RECORD_FIELDS = [
  "attestation_number",
  "issue_date",
  "document_type",
  "issuing_office",
  "issuing_authority",
  "officer",
] as const;
export type RecordField = (typeof RECORD_FIELDS)[number];

/* ---------------- Defaults (the reference design) ---------------- */

function t(text: string, hidden = false): PText {
  return { text, hidden };
}

function l(id: string, text: string, href = "#", opts: Partial<PLink> = {}): PLink {
  return { id, text, href, new_tab: false, hidden: false, icon: "none", width: null, ...opts };
}

function img(alt: string): PImage {
  return { key: null, content_type: null, filename: null, alt, href: "#", new_tab: false, hidden: false };
}

function social(id: string, icon: SocialIcon, label: string): PSocial {
  return { id, icon, label, href: "#", new_tab: true, hidden: false };
}

export const DEFAULT_TOOLS: Record<ViewerTool, boolean> = Object.fromEntries(
  VIEWER_TOOLS.map((tool) => [tool.key, true]),
) as Record<ViewerTool, boolean>;

export const DEFAULT_DESKTOP: DesktopContent = {
  meta: { title: "General Attestation Verification", animations: true },
  header: {
    logo: img("Notary Public and Legal Services"),
    title: { text: "GUJRAT NOTARY PUBLIC OFFICE", hidden: false, href: "#", new_tab: false },
    subtitle: t("ASAD ALI (ADVOCATE HIGH COURT)"),
    top_links: [
      l("top-press", "Press Releases", "#", { width: 84.7 }),
      l("top-legal", "LEGAL Services", "#", { width: 98.7 }),
      l("top-directory", "NPLS Directory", "#", { width: 91.9 }),
      l("top-portal", "Applicant Portal", "#", { width: 108.5, icon: "arrow", new_tab: true }),
    ],
    connect: t("Connect with NPLS"),
    social: [
      social("social-x", "x", "X"),
      social("social-facebook", "facebook", "Facebook"),
      social("social-linkedin", "linkedin", "LinkedIn"),
      social("social-threads", "threads", "Threads"),
      social("social-youtube", "youtube", "YouTube"),
    ],
  },
  nav: {
    items: [
      l("nav-home", "Home", "#", { width: 137.6 }),
      l("nav-attestation", "Attestation", "#", { width: 137.8 }),
      l("nav-apply", "How to Apply", "#", { width: 139.6 }),
      l("nav-sops", "SOPs & Checklists", "#", { width: 159 }),
      l("nav-fees", "Fee Structure", "#", { width: 141.2 }),
      l("nav-countries", "Countries", "#", { width: 157.8 }),
      l("nav-verify", "Verify\nDocument", "#", { width: 133, icon: "shield" }),
    ],
  },
  hero: {
    crumbs: [l("crumb-home", "Home", "#"), l("crumb-verify", "Verify General Attestation", "#")],
    crumb_current: t("Result"),
    eyebrow: t("DOCUMENT VERIFICATION"),
    title: t("General Attestation Verification."),
    title_accent: t("Certificate Result"),
    lead: t("This General Attestation record is issued by the Notary Publice & Legal Services, Gujrat."),
    art: { hidden: false },
  },
  result: {
    found_title: t("MATCHING RECORD FOUND"),
    document_label: t("Document:"),
    issued_label: t("Issued on"),
    missing_title: t("NO MATCHING RECORD FOUND"),
    missing_text: t(
      "No General Attestation record matches the number and date in this link. Check the link, or verify another General Attestation.",
    ),
  },
  record: {
    eyebrow: t("VERIFICATION RECORD"),
    title: t("General Attestation certificate"),
    logo: img("Notary Public and Legal Services"),
    cert_title: t("GENERAL ATTESTATION"),
    cert_subtitle: t("Notary Public & Legal Services, Gujrat"),
    labels: {
      attestation_number: t("Attestation number"),
      issue_date: t("Date of issue"),
      document_type: t("Document type"),
      issuing_office: t("Issuing office"),
      issuing_authority: t("Issuing authority"),
      officer: t("Approving officer"),
    },
    designation: { hidden: false },
    signature: { hidden: false },
    disclaimer: t(
      "This verification confirms that a General Attestation record matches the document number and date provided. It does not verify the contents of the underlying document.",
    ),
  },
  document: {
    eyebrow: t("SUPPORTING DOCUMENT"),
    title: t("Original Document Attached"),
    open: l("doc-open", "Open document", "", { icon: "arrow", new_tab: true }),
    viewer: { sidebar_open: true, tools: { ...DEFAULT_TOOLS } },
  },
  cta: {
    button: l("cta-button", "Verify another General Attestation", "#"),
    help_before: t("For assistance, email"),
    email: l("cta-email", "verification@nplsgujrat.com", "mailto:verification@nplsgujrat.com"),
    help_after: t("with the General Attestation number and date."),
  },
  footer: {
    title: t("NOTARY PUBLIC & LEGAL SERVICES"),
    visit: l("footer-visit", "Visit official website", "#", { icon: "arrow", new_tab: true }),
    logo: img("Notary Public and Legal Services"),
    brand_title: { text: "GUJRAT NOTARY PUBLIC OFFICE", hidden: false, href: "#", new_tab: false },
    brand_subtitle: t("ASAD ALI (ADVOCATE HIGH COURT)"),
    left_links: [
      l("footer-left-attestation", "Document Attestation Services"),
      l("footer-left-notrization", "Notrization and Legalization"),
    ],
    rows: [
      [
        l("footer-law", "Governing Law", "#", { width: 124.7 }),
        l("footer-ceo", "The CEO’s Office", "#", { width: 112.4 }),
        l("footer-npls", "NPLS", "#", { width: 37.5 }),
        l("footer-services", "Attestation Services", "#", { width: 129.9 }),
        l("footer-contact", "Contact Us"),
      ],
      [
        l("footer-legal", "Legal Services", "#", { width: 99 }),
        l("footer-checklist", "General Attestation Checklist", "#", { width: 147.2 }),
        l("footer-fees", "Fees", "#", { width: 37.7 }),
        l("footer-countries", "Countries", "#", { width: 61 }),
        l("footer-process", "Application Process"),
      ],
      [
        l("footer-other", "Other Services", "#", { width: 84.7 }),
        l("footer-verify", "Verify General Attestation", "#", { width: 131.7 }),
        l("footer-courier", "Partner Courier Companies", "#", { width: 155.1 }),
        l("footer-accessibility", "Accessability Statement"),
      ],
    ],
    copyright: t("Copyright © 2026 Notary Public And Legal Services, Head Office, Gujrat. All rights reserved."),
    powered: l("footer-powered", "Powered by DigiLogix", "#"),
  },
};

export const DEFAULT_MOBILE: MobileContent = { note: "" };

/* ---------------- Checking what the editor sends ---------------- */

const MAX_TEXT = 600;
const MAX_HREF = 1000;
const MAX_ITEMS = 24;

function str(v: unknown, fallback: string, max = MAX_TEXT): string {
  if (typeof v !== "string") return fallback;
  // Line breaks are kept (a heading can be split over two lines); other control characters are not.
  return v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").slice(0, max);
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/**
 * Links may be web addresses, mail and phone links, or addresses on this site. Anything else — a
 * javascript: link above all — is dropped, since the page is public.
 */
export function safeHref(v: unknown, fallback = "#"): string {
  if (typeof v !== "string") return fallback;
  const s = v.trim().slice(0, MAX_HREF);
  if (!s) return "";
  if (/^(https?:\/\/|mailto:|tel:|\/|#|\?)/i.test(s)) return s;
  // A bare domain such as example.com is read as a web address.
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(s)) return `https://${s}`;
  return fallback;
}

function num(v: unknown, fallback: number | null): number | null {
  if (v === null || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1062, Math.round(n * 10) / 10));
}

function id(v: unknown, fallback: string): string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : fallback;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function cleanText(v: unknown, d: PText): PText {
  const o = obj(v);
  return { text: str(o.text, d.text), hidden: bool(o.hidden, d.hidden) };
}

function cleanLinkText(v: unknown, d: PLinkText): PLinkText {
  const o = obj(v);
  return { ...cleanText(o, d), href: safeHref(o.href, d.href), new_tab: bool(o.new_tab, d.new_tab) };
}

function cleanIcon(v: unknown, d: LinkIcon): LinkIcon {
  return LINK_ICONS.some((i) => i.value === v) ? (v as LinkIcon) : d;
}

function cleanLink(v: unknown, d: PLink): PLink {
  const o = obj(v);
  return {
    id: id(o.id, d.id),
    text: str(o.text, d.text),
    href: safeHref(o.href, d.href),
    new_tab: bool(o.new_tab, d.new_tab),
    hidden: bool(o.hidden, d.hidden),
    icon: cleanIcon(o.icon, d.icon),
    width: o.width === undefined ? d.width : num(o.width, d.width),
  };
}

let seq = 0;
/** A fresh id for an item added in the editor. */
export function newId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * A list of links. Saved items keep their own order; an item the defaults know (same id) starts
 * from that default, and a new one starts blank.
 */
function cleanLinks(v: unknown, d: PLink[], prefix: string): PLink[] {
  if (!Array.isArray(v)) return d.map((x) => ({ ...x }));
  const seen = new Set<string>();
  const out: PLink[] = [];
  for (const raw of v.slice(0, MAX_ITEMS)) {
    const o = obj(raw);
    const base = d.find((x) => x.id === o.id) ?? l(newId(prefix), "New link", "#");
    const item = cleanLink(o, base);
    if (seen.has(item.id)) item.id = newId(prefix);
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function cleanSocials(v: unknown, d: PSocial[]): PSocial[] {
  if (!Array.isArray(v)) return d.map((x) => ({ ...x }));
  const seen = new Set<string>();
  const out: PSocial[] = [];
  for (const raw of v.slice(0, MAX_ITEMS)) {
    const o = obj(raw);
    const base = d.find((x) => x.id === o.id) ?? social(newId("social"), "website", "Website");
    const item: PSocial = {
      id: id(o.id, base.id),
      icon: SOCIAL_ICONS.some((s) => s.value === o.icon) ? (o.icon as SocialIcon) : base.icon,
      label: str(o.label, base.label, 80),
      href: safeHref(o.href, base.href),
      new_tab: bool(o.new_tab, base.new_tab),
      hidden: bool(o.hidden, base.hidden),
    };
    if (seen.has(item.id)) item.id = newId("social");
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/** Logos live in R2 under new-m/page/; nothing else may be pointed at. */
export const PAGE_KEY_RE = /^new-m\/page\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/;

function cleanImage(v: unknown, d: PImage): PImage {
  const o = obj(v);
  const key = typeof o.key === "string" && PAGE_KEY_RE.test(o.key) ? o.key : null;
  return {
    key,
    content_type: key ? str(o.content_type, "image/png", 80) : null,
    filename: key ? str(o.filename, "", 200) : null,
    alt: str(o.alt, d.alt, 200),
    href: safeHref(o.href, d.href),
    new_tab: bool(o.new_tab, d.new_tab),
    hidden: bool(o.hidden, d.hidden),
  };
}

function cleanTools(v: unknown): Record<ViewerTool, boolean> {
  const o = obj(v);
  return Object.fromEntries(VIEWER_TOOLS.map((tool) => [tool.key, bool(o[tool.key], true)])) as Record<
    ViewerTool,
    boolean
  >;
}

/** Whatever was saved (or sent), laid over the defaults: every field present, every value checked. */
export function cleanDesktop(input: unknown): DesktopContent {
  const c = obj(input);
  const d = DEFAULT_DESKTOP;
  const meta = obj(c.meta);
  const header = obj(c.header);
  const nav = obj(c.nav);
  const hero = obj(c.hero);
  const result = obj(c.result);
  const record = obj(c.record);
  const labels = obj(record.labels);
  const doc = obj(c.document);
  const viewer = obj(doc.viewer);
  const cta = obj(c.cta);
  const footer = obj(c.footer);
  const rows = Array.isArray(footer.rows) ? footer.rows : null;

  return {
    meta: { title: str(meta.title, d.meta.title, 200), animations: bool(meta.animations, d.meta.animations) },
    header: {
      logo: cleanImage(header.logo, d.header.logo),
      title: cleanLinkText(header.title, d.header.title),
      subtitle: cleanText(header.subtitle, d.header.subtitle),
      top_links: cleanLinks(header.top_links, d.header.top_links, "top"),
      connect: cleanText(header.connect, d.header.connect),
      social: cleanSocials(header.social, d.header.social),
    },
    nav: { items: cleanLinks(nav.items, d.nav.items, "nav") },
    hero: {
      crumbs: cleanLinks(hero.crumbs, d.hero.crumbs, "crumb"),
      crumb_current: cleanText(hero.crumb_current, d.hero.crumb_current),
      eyebrow: cleanText(hero.eyebrow, d.hero.eyebrow),
      title: cleanText(hero.title, d.hero.title),
      title_accent: cleanText(hero.title_accent, d.hero.title_accent),
      lead: cleanText(hero.lead, d.hero.lead),
      art: { hidden: bool(obj(hero.art).hidden, d.hero.art.hidden) },
    },
    result: {
      found_title: cleanText(result.found_title, d.result.found_title),
      document_label: cleanText(result.document_label, d.result.document_label),
      issued_label: cleanText(result.issued_label, d.result.issued_label),
      missing_title: cleanText(result.missing_title, d.result.missing_title),
      missing_text: cleanText(result.missing_text, d.result.missing_text),
    },
    record: {
      eyebrow: cleanText(record.eyebrow, d.record.eyebrow),
      title: cleanText(record.title, d.record.title),
      logo: cleanImage(record.logo, d.record.logo),
      cert_title: cleanText(record.cert_title, d.record.cert_title),
      cert_subtitle: cleanText(record.cert_subtitle, d.record.cert_subtitle),
      labels: Object.fromEntries(
        RECORD_FIELDS.map((f) => [f, cleanText(labels[f], d.record.labels[f])]),
      ) as DesktopContent["record"]["labels"],
      designation: { hidden: bool(obj(record.designation).hidden, d.record.designation.hidden) },
      signature: { hidden: bool(obj(record.signature).hidden, d.record.signature.hidden) },
      disclaimer: cleanText(record.disclaimer, d.record.disclaimer),
    },
    document: {
      eyebrow: cleanText(doc.eyebrow, d.document.eyebrow),
      title: cleanText(doc.title, d.document.title),
      open: cleanLink(doc.open, d.document.open),
      viewer: {
        sidebar_open: bool(viewer.sidebar_open, d.document.viewer.sidebar_open),
        tools: cleanTools(viewer.tools),
      },
    },
    cta: {
      button: cleanLink(cta.button, d.cta.button),
      help_before: cleanText(cta.help_before, d.cta.help_before),
      email: cleanLink(cta.email, d.cta.email),
      help_after: cleanText(cta.help_after, d.cta.help_after),
    },
    footer: {
      title: cleanText(footer.title, d.footer.title),
      visit: cleanLink(footer.visit, d.footer.visit),
      logo: cleanImage(footer.logo, d.footer.logo),
      brand_title: cleanLinkText(footer.brand_title, d.footer.brand_title),
      brand_subtitle: cleanText(footer.brand_subtitle, d.footer.brand_subtitle),
      left_links: cleanLinks(footer.left_links, d.footer.left_links, "footer-left"),
      rows: d.footer.rows.map((defRow, i) => cleanLinks(rows ? rows[i] : undefined, defRow, `footer-row${i}`)),
      copyright: cleanText(footer.copyright, d.footer.copyright),
      powered: cleanLink(footer.powered, d.footer.powered),
    },
  };
}

export function cleanMobile(input: unknown): MobileContent {
  return { note: str(obj(input).note, "", 2000) };
}

/** Every logo key a desktop content points at, so storage cleanup leaves them alone. */
export function imageKeys(c: DesktopContent): string[] {
  return [c.header.logo.key, c.record.logo.key, c.footer.logo.key].filter((k): k is string => Boolean(k));
}

/* ---------------- Addressing pieces of the page (the editor) ---------------- */

/**
 * Every clickable piece of the page has a path into the content, e.g. "header.title",
 * "nav.items.nav-home" or "footer.rows.1.footer-fees". List items are addressed by id, so a path
 * still points at the same item after the list is reordered.
 */
export function getAt(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const part of path.split(".")) {
    if (Array.isArray(cur)) {
      const byId = (cur as Array<{ id?: string } | null>).find((x) => x && typeof x === "object" && x.id === part);
      cur = byId ?? (/^\d+$/.test(part) ? cur[Number(part)] : undefined);
    } else if (cur && typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

/** A copy of root with the value at path replaced. */
export function setAt<T>(root: T, path: string, value: unknown): T {
  const parts = path.split(".");
  function walk(node: unknown, i: number): unknown {
    if (i === parts.length) return value;
    const part = parts[i];
    if (Array.isArray(node)) {
      const idx = node.findIndex((x) => x && typeof x === "object" && (x as { id?: string }).id === part);
      const at = idx >= 0 ? idx : /^\d+$/.test(part) ? Number(part) : -1;
      if (at < 0 || at >= node.length) return node;
      const copy = node.slice();
      copy[at] = walk(node[at], i + 1);
      return copy;
    }
    const o = (node && typeof node === "object" ? node : {}) as Record<string, unknown>;
    return { ...o, [part]: walk(o[part], i + 1) };
  }
  return walk(root, 0) as T;
}

/** For a path to a list item, the list's path and the item's id; null when the path is not a list item. */
export function listOf(root: unknown, path: string): { listPath: string; itemId: string } | null {
  const i = path.lastIndexOf(".");
  if (i < 0) return null;
  const listPath = path.slice(0, i);
  const list = getAt(root, listPath);
  if (!Array.isArray(list)) return null;
  const itemId = path.slice(i + 1);
  return list.some((x) => x && typeof x === "object" && (x as { id?: string }).id === itemId) ? { listPath, itemId } : null;
}

/* ---------------- What a document shows ---------------- */

/** One document's values, as the page shows them. */
export interface PageRecord {
  attestation_number: string;
  /** Already formatted, e.g. "15 Oct 2026". */
  issue_date: string;
  document_type: string;
  issuing_office: string;
  issuing_authority: string;
  officer_name: string;
  officer_designation: string;
  signature_url: string | null;
  document: {
    /** Same-site address pdf.js reads the PDF from (supports byte ranges). */
    src: string;
    /** Opens the PDF in a new tab. */
    open_url: string;
    /** Saves the PDF. */
    download_url: string;
    filename: string;
    size: number;
  } | null;
}

/** Values from the reference design, for the editor when no document is picked. */
export const SAMPLE_RECORD: PageRecord = {
  attestation_number: "GEN-PSMK-XHLI-NSML",
  issue_date: "15 Oct 2026",
  document_type: "School Leaving Certificate (SLC)",
  issuing_office: "Court Road, Gujrat",
  issuing_authority: "Notary Public & Legal Services, Gujrat",
  officer_name: "Muhammad Junaid Khalid",
  officer_designation: "Notary Officer",
  signature_url: null,
  document: null,
};
