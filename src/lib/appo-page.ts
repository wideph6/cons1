/**
 * The Appo verification page: what it says, where each piece links to, and which logos it shows.
 *
 * The super admin edits all of it from Appo → Page design. The text, links and settings are saved in
 * the database (appo_page_settings, one row per view); uploaded logos are saved in R2 under
 * appo/page/ and only their storage keys are kept here. Everything has a default taken from the
 * reference design, so a page that was never edited already looks like it.
 *
 * No server imports: the editor, the public page and the API all read and check content with this file.
 */

import type { CSSProperties } from "react";

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

/** A logo. key is the R2 object (appo/page/...); null shows the built-in emblem. */
export interface PImage {
  key: string | null;
  content_type: string | null;
  filename: string | null;
  alt: string;
  href: string;
  new_tab: boolean;
  hidden: boolean;
}

/** The browser tab's icon. key is the R2 object (appo/page/...); null shows the app's own icon. */
export interface PFavicon {
  key: string | null;
  content_type: string | null;
  filename: string | null;
}

/** What a favicon may be stored and served as. */
export const FAVICON_TYPES = ["image/png", "image/x-icon", "image/svg+xml", "image/jpeg", "image/webp", "image/gif"];

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
  /**
   * The browser tab's title and icon, and whether the page animates as it opens. pdf_favicon is the
   * icon of the tab a document's PDF opens in; without one that tab shows the page's favicon.
   */
  meta: { title: string; animations: boolean; favicon: PFavicon; pdf_favicon: PFavicon };
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
    /**
     * Appo's own entries, in the order the page shows them; the super admin rewords, renumbers, reorders
     * and hides them. Saved in the database with the rest of the page, never in the code.
     */
    rows: RecordRow[];
    /** How the certificate box (the "certificate" row) looks. */
    certificate: CertificateStyle;
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

/** How the document is shown on a phone. */
export type MobileViewerMode = "card" | "pages";
export const MOBILE_VIEWER_MODES: { value: MobileViewerMode; label: string }[] = [
  { value: "card", label: "File card with an Open button (as in the design)" },
  { value: "pages", label: "The PDF's pages, one under the other" },
];

/**
 * The mobile view: its own wording, links and logos, laid out after the mobile design. The main menu
 * sits behind the hamburger button, together with the header's quick links and social icons.
 */
export interface MobileContent {
  meta: { animations: boolean };
  header: {
    logo: PImage;
    title: PLinkText;
    subtitle: PText;
    /** The hamburger button: its spoken name, and whether it is shown at all. */
    menu_button: PText;
  };
  menu: {
    items: PLink[];
    links_title: PText;
    links: PLink[];
    connect: PText;
    social: PSocial[];
  };
  hero: DesktopContent["hero"];
  result: DesktopContent["result"];
  record: DesktopContent["record"];
  document: {
    eyebrow: PText;
    title: PText;
    open: PLink;
    viewer: {
      mode: MobileViewerMode;
      /** The file's name under the PDF icon. */
      filename: { hidden: boolean };
      /** The blue button under the file name. */
      button: PText;
    };
  };
  cta: DesktopContent["cta"];
  footer: DesktopContent["footer"];
  /** Notes for whoever works on the mobile design; never shown on the page. */
  note: string;
}

/**
 * The verification record's entries, as they start. Each document fills in its own value; Country's
 * value is fixed text set on the page. The certificate box sits between 4 and 5 and has no value.
 */
export const RECORD_ROWS = [
  "country",
  "document_type",
  "signed_by",
  "signed_capacity",
  "seal_stamp",
  "certificate",
  "office_city",
  "issue_date",
  "office_name",
  "attestation_number",
  "officer",
] as const;
export type RecordRowId = (typeof RECORD_ROWS)[number];

/** stacked: the words on one line and the value on the next. inline: the value right after the words, wrapping on narrow screens. */
export type RowLayout = "stacked" | "inline";
export const ROW_LAYOUTS: { value: RowLayout; label: string }[] = [
  { value: "stacked", label: "Two lines — the value under the words" },
  { value: "inline", label: "One line — the value after the words (wraps on phones)" },
];

/** One entry of the verification record. */
export interface RecordRow {
  id: RecordRowId;
  /** Shown before the words, e.g. "2"; empty shows none. */
  number: string;
  /** The words, e.g. "Previously signed by". In the certificate box, its text. */
  text: string;
  /** Country's value ("Pakistan"), fixed on the page. Every other entry shows the document's own value. */
  value: string;
  layout: RowLayout;
  hidden: boolean;
}

export type CertificateFont = "serif" | "sans" | "arial";
export const CERTIFICATE_FONTS: { value: CertificateFont; label: string }[] = [
  { value: "serif", label: "Serif (Georgia)" },
  { value: "sans", label: "Sans (the page's own)" },
  { value: "arial", label: "Arial" },
];

export type CertificateBorderSides = "lines" | "box";
export const CERTIFICATE_BORDER_SIDES: { value: CertificateBorderSides; label: string }[] = [
  { value: "lines", label: "A line above and below" },
  { value: "box", label: "A line all round" },
];

/** The certificate box's look. Sizes are in the view's design pixels (1062 px wide desktop, 360 px phone). */
export interface CertificateStyle {
  font: CertificateFont;
  size: number;
  bold: boolean;
  italic: boolean;
  uppercase: boolean;
  /** Letter spacing in em. */
  spacing: number;
  /** #rrggbb */
  color: string;
  background: string;
  /** #rrggbb, or empty for no border. */
  border: string;
  /** lines: a line above and below the box, as in the design; box: a line all round. */
  border_sides: CertificateBorderSides;
  /** Share of the record's width, in percent. */
  width: number;
  /** Least height, in design pixels. */
  height: number;
  radius: number;
}

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

function row(id: RecordRowId, number: string, text: string, layout: RowLayout = "stacked", value = ""): RecordRow {
  return { id, number, text, value, layout, hidden: false };
}

/** The entries as the super admin first described them; every word can be changed under Page design. */
export const DEFAULT_ROWS: RecordRow[] = [
  row("country", "1", "Country", "stacked", "Pakistan"),
  row("document_type", "", "Document Type:", "inline"),
  row("signed_by", "2", "Previously signed by"),
  row("signed_capacity", "3", "Previous Signed acting in capacity"),
  row("seal_stamp", "4", "Bears the seal or stamp"),
  row("certificate", "", "Certified"),
  row("office_city", "5", "Office City"),
  row("issue_date", "6", "Date"),
  row("office_name", "7", "Office Name"),
  row("attestation_number", "8", "Complete Number"),
  row("officer", "", "Approving officer"),
];

/**
 * The certificate box as in the super admin's design: "Certified" in bold serif, dark green, centred on a
 * pale green band as wide as the record, with a thin line above and below it. The text is a little under
 * half the band's height.
 */
export const DEFAULT_CERTIFICATE: CertificateStyle = {
  font: "serif",
  size: 16,
  bold: true,
  italic: false,
  uppercase: false,
  spacing: 0,
  color: "#064b2b",
  background: "#eaf1e5",
  border: "#bdccbc",
  border_sides: "lines",
  width: 100,
  height: 36,
  radius: 0,
};

/** The same on the phone's 360 px grid, kept in proportion with the entries round it. */
export const DEFAULT_MOBILE_CERTIFICATE: CertificateStyle = { ...DEFAULT_CERTIFICATE, size: 18, height: 41 };

export const DEFAULT_TOOLS: Record<ViewerTool, boolean> = Object.fromEntries(
  VIEWER_TOOLS.map((tool) => [tool.key, true]),
) as Record<ViewerTool, boolean>;

export const DEFAULT_DESKTOP: DesktopContent = {
  meta: {
    title: "General Attestation Verification",
    animations: true,
    favicon: { key: null, content_type: null, filename: null },
    pdf_favicon: { key: null, content_type: null, filename: null },
  },
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
    rows: DEFAULT_ROWS.map((r) => ({ ...r })),
    certificate: { ...DEFAULT_CERTIFICATE },
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

/** A copy of a list with every item made fresh, so the two views never share an object. */
function copyLinks(list: PLink[], change?: (l: PLink) => Partial<PLink>): PLink[] {
  return list.map((l) => ({ ...l, ...(change ? change(l) : {}) }));
}

/**
 * Footer link widths on the phone, measured from the mobile design (in its 360 px grid). The links
 * wrap onto a second line inside each group exactly as the design does.
 */
const MOBILE_FOOTER_WIDTHS: Record<string, number | null> = {
  "footer-law": 141.5,
  "footer-ceo": 127,
  "footer-npls": 42.6,
  "footer-services": 147.5,
  "footer-contact": null,
  "footer-legal": 114,
  "footer-checklist": 168,
  "footer-fees": 42,
  "footer-countries": 69,
  "footer-process": null,
  "footer-other": 96,
  "footer-verify": 149.5,
  "footer-courier": 172.5,
  "footer-accessibility": null,
};

/** Words the mobile design spells differently from the desktop one. */
const MOBILE_TEXT: Record<string, string> = {
  "footer-left-notrization": "Notarization and Legalization",
  "footer-accessibility": "Accessibility Statement",
};

export const DEFAULT_MOBILE: MobileContent = {
  meta: { animations: true },
  header: {
    logo: { ...DEFAULT_DESKTOP.header.logo },
    title: { ...DEFAULT_DESKTOP.header.title },
    subtitle: { ...DEFAULT_DESKTOP.header.subtitle },
    menu_button: t("Menu"),
  },
  menu: {
    items: copyLinks(DEFAULT_DESKTOP.nav.items, (l) => ({ text: l.text.replace(/\s*\n\s*/g, " "), width: null })),
    links_title: t("Quick links"),
    links: copyLinks(DEFAULT_DESKTOP.header.top_links, () => ({ width: null })),
    connect: { ...DEFAULT_DESKTOP.header.connect },
    social: DEFAULT_DESKTOP.header.social.map((x) => ({ ...x })),
  },
  hero: {
    ...DEFAULT_DESKTOP.hero,
    crumbs: copyLinks(DEFAULT_DESKTOP.hero.crumbs),
    lead: t("This General Attestation record is issued by the Notary Public"),
  },
  result: { ...DEFAULT_DESKTOP.result },
  record: {
    ...DEFAULT_DESKTOP.record,
    logo: { ...DEFAULT_DESKTOP.record.logo },
    rows: DEFAULT_ROWS.map((r) => ({ ...r })),
    certificate: { ...DEFAULT_MOBILE_CERTIFICATE },
  },
  document: {
    eyebrow: { ...DEFAULT_DESKTOP.document.eyebrow },
    title: { ...DEFAULT_DESKTOP.document.title },
    open: { ...DEFAULT_DESKTOP.document.open },
    viewer: { mode: "card", filename: { hidden: false }, button: t("Open") },
  },
  cta: { ...DEFAULT_DESKTOP.cta },
  footer: {
    ...DEFAULT_DESKTOP.footer,
    logo: { ...DEFAULT_DESKTOP.footer.logo },
    left_links: copyLinks(DEFAULT_DESKTOP.footer.left_links, (l) => (MOBILE_TEXT[l.id] ? { text: MOBILE_TEXT[l.id] } : {})),
    rows: DEFAULT_DESKTOP.footer.rows.map((row) =>
      copyLinks(row, (l) => ({
        width: MOBILE_FOOTER_WIDTHS[l.id] ?? null,
        ...(MOBILE_TEXT[l.id] ? { text: MOBILE_TEXT[l.id] } : {}),
      })),
    ),
  },
  note: "",
};

/* ---------------- Checking what the editor sends ---------------- */

const MAX_TEXT = 600;
const MAX_HREF = 1000;
/** The most items a list (menu, footer row, social icons…) keeps. */
export const MAX_ITEMS = 24;

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

/** Logos live in R2 under appo/page/; nothing else may be pointed at. */
export const PAGE_KEY_RE = /^appo\/page\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/;

function cleanFavicon(v: unknown): PFavicon {
  const o = obj(v);
  const key = typeof o.key === "string" && PAGE_KEY_RE.test(o.key) ? o.key : null;
  // Served from this site with this type, so only an image type is taken.
  const type = typeof o.content_type === "string" && FAVICON_TYPES.includes(o.content_type) ? o.content_type : null;
  if (!key || !type) return { key: null, content_type: null, filename: null };
  return { key, content_type: type, filename: str(o.filename, "", 200) };
}

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
  const doc = obj(c.document);
  const viewer = obj(doc.viewer);
  const cta = obj(c.cta);
  const footer = obj(c.footer);

  return {
    meta: {
      title: str(meta.title, d.meta.title, 200),
      animations: bool(meta.animations, d.meta.animations),
      favicon: cleanFavicon(meta.favicon),
      pdf_favicon: cleanFavicon(meta.pdf_favicon),
    },
    header: {
      logo: cleanImage(header.logo, d.header.logo),
      title: cleanLinkText(header.title, d.header.title),
      subtitle: cleanText(header.subtitle, d.header.subtitle),
      top_links: cleanLinks(header.top_links, d.header.top_links, "top"),
      connect: cleanText(header.connect, d.header.connect),
      social: cleanSocials(header.social, d.header.social),
    },
    nav: { items: cleanLinks(nav.items, d.nav.items, "nav") },
    hero: cleanHero(hero, d.hero),
    result: cleanResult(result, d.result),
    record: cleanRecord(record, d.record),
    document: {
      eyebrow: cleanText(doc.eyebrow, d.document.eyebrow),
      title: cleanText(doc.title, d.document.title),
      open: cleanLink(doc.open, d.document.open),
      viewer: {
        sidebar_open: bool(viewer.sidebar_open, d.document.viewer.sidebar_open),
        tools: cleanTools(viewer.tools),
      },
    },
    cta: cleanCta(cta, d.cta),
    footer: cleanFooter(footer, d.footer),
  };
}

type Hero = DesktopContent["hero"];
type Result = DesktopContent["result"];
type RecordSection = DesktopContent["record"];
type Cta = DesktopContent["cta"];
type Footer = DesktopContent["footer"];

function cleanHero(hero: Record<string, unknown>, d: Hero): Hero {
  return {
    crumbs: cleanLinks(hero.crumbs, d.crumbs, "crumb"),
    crumb_current: cleanText(hero.crumb_current, d.crumb_current),
    eyebrow: cleanText(hero.eyebrow, d.eyebrow),
    title: cleanText(hero.title, d.title),
    title_accent: cleanText(hero.title_accent, d.title_accent),
    lead: cleanText(hero.lead, d.lead),
    art: { hidden: bool(obj(hero.art).hidden, d.art.hidden) },
  };
}

function cleanResult(result: Record<string, unknown>, d: Result): Result {
  return {
    found_title: cleanText(result.found_title, d.found_title),
    document_label: cleanText(result.document_label, d.document_label),
    issued_label: cleanText(result.issued_label, d.issued_label),
    missing_title: cleanText(result.missing_title, d.missing_title),
    missing_text: cleanText(result.missing_text, d.missing_text),
  };
}

/** One entry, checked. Only Country keeps a value of its own; the rest show the document's. */
function cleanRow(o: Record<string, unknown>, d: RecordRow): RecordRow {
  return {
    id: d.id,
    number: str(o.number, d.number, 12).replace(/\n/g, " "),
    text: str(o.text, d.text),
    value: d.id === "country" ? str(o.value, d.value, 200).replace(/\n/g, " ") : "",
    layout: o.layout === "inline" || o.layout === "stacked" ? o.layout : d.layout,
    hidden: bool(o.hidden, d.hidden),
  };
}

/**
 * Every entry exactly once, in the saved order. An entry the saved order lacks (one added in a later
 * version) goes in after the entry it follows in the defaults.
 */
function cleanRows(v: unknown, d: RecordRow[]): RecordRow[] {
  const out: RecordRow[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(v) ? v.slice(0, 40) : []) {
    const o = obj(raw);
    const base = d.find((x) => x.id === o.id);
    if (!base || seen.has(base.id)) continue;
    seen.add(base.id);
    out.push(cleanRow(o, base));
  }
  d.forEach((r, i) => {
    if (seen.has(r.id)) return;
    const before = d
      .slice(0, i)
      .reverse()
      .find((x) => seen.has(x.id));
    out.splice(before ? out.findIndex((x) => x.id === before.id) + 1 : 0, 0, { ...r });
    seen.add(r.id);
  });
  return out;
}

function color(v: unknown, fallback: string, allowEmpty = false): string {
  if (typeof v !== "string") return fallback;
  const c = v.trim().toLowerCase();
  if (allowEmpty && c === "") return "";
  return /^#[0-9a-f]{6}$/.test(c) ? c : fallback;
}

function between(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n * 100) / 100));
}

function cleanCertificate(v: unknown, d: CertificateStyle): CertificateStyle {
  const o = obj(v);
  return {
    font: CERTIFICATE_FONTS.some((f) => f.value === o.font) ? (o.font as CertificateFont) : d.font,
    size: between(o.size, d.size, 6, 60),
    bold: bool(o.bold, d.bold),
    italic: bool(o.italic, d.italic),
    uppercase: bool(o.uppercase, d.uppercase),
    spacing: between(o.spacing, d.spacing, 0, 1),
    color: color(o.color, d.color),
    background: color(o.background, d.background),
    border: color(o.border, d.border, true),
    border_sides: CERTIFICATE_BORDER_SIDES.some((b) => b.value === o.border_sides) ? (o.border_sides as CertificateBorderSides) : d.border_sides,
    width: between(o.width, d.width, 20, 100),
    height: between(o.height, d.height, 0, 200),
    radius: between(o.radius, d.radius, 0, 40),
  };
}

function cleanRecord(record: Record<string, unknown>, d: RecordSection): RecordSection {
  return {
    eyebrow: cleanText(record.eyebrow, d.eyebrow),
    title: cleanText(record.title, d.title),
    logo: cleanImage(record.logo, d.logo),
    cert_title: cleanText(record.cert_title, d.cert_title),
    cert_subtitle: cleanText(record.cert_subtitle, d.cert_subtitle),
    rows: cleanRows(record.rows, d.rows),
    certificate: cleanCertificate(record.certificate, d.certificate),
    designation: { hidden: bool(obj(record.designation).hidden, d.designation.hidden) },
    signature: { hidden: bool(obj(record.signature).hidden, d.signature.hidden) },
    disclaimer: cleanText(record.disclaimer, d.disclaimer),
  };
}

function cleanCta(cta: Record<string, unknown>, d: Cta): Cta {
  return {
    button: cleanLink(cta.button, d.button),
    help_before: cleanText(cta.help_before, d.help_before),
    email: cleanLink(cta.email, d.email),
    help_after: cleanText(cta.help_after, d.help_after),
  };
}

function cleanFooter(footer: Record<string, unknown>, d: Footer): Footer {
  const rows = Array.isArray(footer.rows) ? footer.rows : null;
  return {
    title: cleanText(footer.title, d.title),
    visit: cleanLink(footer.visit, d.visit),
    logo: cleanImage(footer.logo, d.logo),
    brand_title: cleanLinkText(footer.brand_title, d.brand_title),
    brand_subtitle: cleanText(footer.brand_subtitle, d.brand_subtitle),
    left_links: cleanLinks(footer.left_links, d.left_links, "footer-left"),
    rows: d.rows.map((defRow, i) => cleanLinks(rows ? rows[i] : undefined, defRow, `footer-row${i}`)),
    copyright: cleanText(footer.copyright, d.copyright),
    powered: cleanLink(footer.powered, d.powered),
  };
}

/** The mobile view's content, checked and laid over the mobile design's defaults like the desktop one. */
export function cleanMobile(input: unknown): MobileContent {
  const c = obj(input);
  const d = DEFAULT_MOBILE;
  const header = obj(c.header);
  const menu = obj(c.menu);
  const doc = obj(c.document);
  const viewer = obj(doc.viewer);
  const mode = viewer.mode === "pages" || viewer.mode === "card" ? viewer.mode : d.document.viewer.mode;
  return {
    meta: { animations: bool(obj(c.meta).animations, d.meta.animations) },
    header: {
      logo: cleanImage(header.logo, d.header.logo),
      title: cleanLinkText(header.title, d.header.title),
      subtitle: cleanText(header.subtitle, d.header.subtitle),
      menu_button: cleanText(header.menu_button, d.header.menu_button),
    },
    menu: {
      items: cleanLinks(menu.items, d.menu.items, "menu"),
      links_title: cleanText(menu.links_title, d.menu.links_title),
      links: cleanLinks(menu.links, d.menu.links, "menu-link"),
      connect: cleanText(menu.connect, d.menu.connect),
      social: cleanSocials(menu.social, d.menu.social),
    },
    hero: cleanHero(obj(c.hero), d.hero),
    result: cleanResult(obj(c.result), d.result),
    record: cleanRecord(obj(c.record), d.record),
    document: {
      eyebrow: cleanText(doc.eyebrow, d.document.eyebrow),
      title: cleanText(doc.title, d.document.title),
      open: cleanLink(doc.open, d.document.open),
      viewer: {
        mode,
        filename: { hidden: bool(obj(viewer.filename).hidden, d.document.viewer.filename.hidden) },
        button: cleanText(viewer.button, d.document.viewer.button),
      },
    },
    cta: cleanCta(obj(c.cta), d.cta),
    footer: cleanFooter(obj(c.footer), d.footer),
    note: str(c.note, "", 2000),
  };
}

/**
 * Every logo and favicon key a view's content points at, so storage cleanup leaves them alone. The
 * favicons are set on the desktop view and serve both.
 */
export function imageKeys(c: DesktopContent | MobileContent): string[] {
  const favicons = "favicon" in c.meta ? [c.meta.favicon.key, c.meta.pdf_favicon.key] : [];
  return [c.header.logo.key, c.record.logo.key, c.footer.logo.key, ...favicons].filter((k): k is string => Boolean(k));
}

/**
 * The address a favicon is served from: the page's, or (for "pdf") the PDF tab's. It changes with every
 * upload (the key holds a fresh id), so browsers may keep it for good and still pick up a new one.
 */
export function faviconHref(f: PFavicon, which: "page" | "pdf" = "page"): string | null {
  if (!f.key) return null;
  const v = f.key.split("/")[2] ?? "";
  return which === "pdf" ? `/api/appo/favicon?for=pdf&v=${v}` : `/api/appo/favicon?v=${v}`;
}

/** How a document's PDF is named on the page, for previews: 40 random letters and digits. */
export const SAMPLE_PDF_NAME = "ddwhrO4nWtA99vRYDAnUVtWcK3aoYPJhxmbVlwLp.pdf";

/**
 * The mobile view with the desktop view's wording, links and logos copied in, for the editor's
 * "Copy from desktop". What only the phone has (the menu button, the file card, footer link widths
 * on the phone, notes) stays as it is; list items keep their phone width where the item matches.
 */
export function mobileFromDesktop(desk: DesktopContent, mob: MobileContent): MobileContent {
  const widthOf = (id: string) => mob.footer.rows.flat().find((l) => l.id === id)?.width ?? MOBILE_FOOTER_WIDTHS[id] ?? null;
  return cleanMobile({
    ...mob,
    meta: { animations: desk.meta.animations },
    header: {
      logo: desk.header.logo,
      title: desk.header.title,
      subtitle: desk.header.subtitle,
      menu_button: mob.header.menu_button,
    },
    menu: {
      ...mob.menu,
      items: desk.nav.items.map((l) => ({ ...l, text: l.text.replace(/\s*\n\s*/g, " "), width: null })),
      links: desk.header.top_links.map((l) => ({ ...l, width: null })),
      connect: desk.header.connect,
      social: desk.header.social,
    },
    hero: desk.hero,
    result: desk.result,
    record: desk.record,
    document: { ...mob.document, eyebrow: desk.document.eyebrow, title: desk.document.title, open: desk.document.open },
    cta: desk.cta,
    footer: {
      ...desk.footer,
      rows: desk.footer.rows.map((row) => row.map((l) => ({ ...l, width: widthOf(l.id) }))),
    },
  });
}

/**
 * The part of the verification record that is Appo's alone: its entries (rows, the certificate box,
 * the officer's designation and signature) and the note under them. Copying New M's page design
 * leaves it as it is, since New M's record has its own; everything else on the page is shared.
 */
export function keepRecordEntries<T extends DesktopContent | MobileContent>(copied: T, own: T): T {
  return {
    ...copied,
    record: {
      ...copied.record,
      rows: own.record.rows.map((r) => ({ ...r })),
      certificate: { ...own.record.certificate },
      designation: { ...own.record.designation },
      signature: { ...own.record.signature },
      disclaimer: { ...own.record.disclaimer },
    },
  };
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
  /** Already formatted, e.g. "15 Oct 2026" (the banner). */
  issue_date: string;
  /** The record's Date, e.g. "29th of October 2026". */
  issue_date_long: string;
  document_type: string;
  signed_by: string;
  signed_capacity: string;
  seal_stamp: string;
  office_city: string;
  office_name: string;
  officer_name: string;
  officer_designation: string;
  signature_url: string | null;
  document: {
    /** Same-site address pdf.js reads the PDF from (supports byte ranges). */
    src: string;
    /** Opens the PDF in a new tab: /storage/applications/{number}/documents/{name}.pdf. */
    open_url: string;
    /** Saves the PDF as {name}.pdf; what phones do with the document. */
    download_url: string;
    /** {name}.pdf, the document's 40-character name; never the name it was uploaded with. */
    filename: string;
    size: number;
  } | null;
}

/** The value an entry shows: Country's fixed value, or the document's own. */
export function rowValue(row: RecordRow, r: PageRecord): string {
  switch (row.id) {
    case "country":
      return row.value;
    case "document_type":
      return r.document_type;
    case "signed_by":
      return r.signed_by;
    case "signed_capacity":
      return r.signed_capacity;
    case "seal_stamp":
      return r.seal_stamp;
    case "office_city":
      return r.office_city;
    case "issue_date":
      return r.issue_date_long;
    case "office_name":
      return r.office_name;
    case "attestation_number":
      return r.attestation_number;
    case "officer":
      return r.officer_name;
    default:
      return "";
  }
}

/**
 * The certificate box's look as inline CSS. unit turns design pixels into the view's scaled CSS size,
 * and fonts names each font choice as the view's stylesheet does, so one style serves both views.
 */
export function certificateStyle(
  s: CertificateStyle,
  unit: (n: number) => string,
  fonts: Record<CertificateFont, string>,
): CSSProperties {
  return {
    fontFamily: fonts[s.font],
    fontSize: unit(s.size),
    fontWeight: s.bold ? 700 : 400,
    fontStyle: s.italic ? "italic" : "normal",
    textTransform: s.uppercase ? "uppercase" : "none",
    letterSpacing: `${s.spacing}em`,
    color: s.color,
    background: s.background,
    ...(s.border
      ? s.border_sides === "box"
        ? { border: `${unit(1)} solid ${s.border}` }
        : { border: "none", borderTop: `${unit(1)} solid ${s.border}`, borderBottom: `${unit(1)} solid ${s.border}` }
      : { border: "none" }),
    width: `${s.width}%`,
    minHeight: unit(s.height),
    borderRadius: unit(s.radius),
  };
}

/** Values from the reference design, for the editor when no document is picked. */
export const SAMPLE_RECORD: PageRecord = {
  attestation_number: "APN-PSMK-XHLI-NSML",
  issue_date: "29 Oct 2026",
  issue_date_long: "29th of October 2026",
  document_type: "School Leaving Certificate (SLC)",
  signed_by: "Muhammad Asad Ali",
  signed_capacity: "Notary Public",
  seal_stamp: "Notary Public & Legal Services, Gujrat",
  office_city: "Gujrat",
  office_name: "Notary Public & Legal Services",
  officer_name: "Muhammad Junaid Khalid",
  officer_designation: "Notary Officer",
  signature_url: null,
  document: null,
};
