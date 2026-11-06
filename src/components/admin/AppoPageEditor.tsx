"use client";

import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  ImageUp,
  Menu as MenuIcon,
  Monitor,
  MousePointer2,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Search,
  Smartphone,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MobilePage } from "@/components/appo-page/MobilePage";
import { VerifyPage } from "@/components/appo-page/VerifyPage";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  Field,
  Input,
  Loading,
  Select,
  Textarea,
  cx,
  errorMessage,
  useToast,
} from "@/components/ui";
import { api, ClientError, postFormWithProgress, qs } from "@/lib/client";
import { withoutFakeTransparency } from "@/lib/fake-transparency";
import {
  CERTIFICATE_BORDER_SIDES,
  CERTIFICATE_FONTS,
  DATE_FORMATS,
  MAX_MOVE,
  ROW_ALIGNS,
  rowParts,
  cleanDesktop,
  cleanMobile,
  DEFAULT_CERTIFICATE,
  DEFAULT_MOBILE_CERTIFICATE,
  DEFAULT_DESKTOP,
  DEFAULT_MOBILE,
  keepRecordEntries,
  LINK_ICONS,
  MAX_ITEMS,
  MOBILE_VIEWER_MODES,
  PAGE_VIEWS,
  ROW_LAYOUTS,
  SAMPLE_PDF_NAME,
  SAMPLE_RECORD,
  SOCIAL_ICONS,
  VIEWER_TOOLS,
  getAt,
  imageKeys,
  listOf,
  mobileFromDesktop,
  newId,
  safeHref,
  setAt,
  type DesktopContent,
  type LinkIcon,
  type MobileContent,
  type MobileViewerMode,
  type PageRecord,
  type PageView,
  type PFavicon,
  type PImage,
  type PLink,
  type PLinkText,
  type PSocial,
  type PText,
  type CertificateBorderSides,
  type CertificateFont,
  type CertificateStyle,
  type DateFormat,
  type PartMove,
  type RecordRow,
  type RecordRowId,
  type RowAlign,
  type RowLayout,
  type RowPart,
  type SocialIcon,
  type ViewerTool,
} from "@/lib/appo-page";
import type { Paged } from "@/lib/types";
import type { AppoRecord } from "@/lib/appo-types";
import { formatDateTime, formatIssued } from "@/lib/utils";

type AnyContent = DesktopContent | MobileContent;

/* ---------------- What each piece is called ---------------- */

const NAMES: Record<string, string> = {
  "meta": "Page settings",
  "header.logo": "Header logo",
  "header.title": "Office name (header)",
  "header.subtitle": "Office subtitle (header)",
  "header.top_links": "Top button",
  "header.connect": "“Connect with” text",
  "header.social": "Social icon",
  "nav.items": "Main menu item",
  "hero.crumbs": "Breadcrumb link",
  "hero.crumb_current": "Breadcrumb — current page",
  "hero.eyebrow": "Hero small heading",
  "hero.title": "Hero title",
  "hero.title_accent": "Hero second line",
  "hero.lead": "Hero sentence",
  "hero.art": "Hero artwork (shield and circles)",
  "result.found_title": "Banner title — record found",
  "result.document_label": "Banner “Document:” label",
  "result.issued_label": "Banner “Issued on” label",
  "result.missing_title": "Banner title — no record",
  "result.missing_text": "Banner text — no record",
  "record.eyebrow": "Record card small heading",
  "record.title": "Record card title",
  "record.logo": "Certificate logo",
  "record.cert_title": "Certificate title",
  "record.cert_subtitle": "Certificate subtitle",
  "record.rows": "Record entry",
  "record.designation": "Officer designation",
  "record.signature": "Officer signature",
  "record.disclaimer": "Certificate note",
  "document.eyebrow": "Document card small heading",
  "document.title": "Document card title",
  "document.open": "“Open document” button",
  "document.viewer": "PDF viewer",
  "cta.button": "Bottom button",
  "cta.help_before": "Help text — before the email",
  "cta.email": "Help email link",
  "cta.help_after": "Help text — after the email",
  "footer.title": "Footer heading",
  "footer.visit": "“Visit official website” link",
  "footer.logo": "Footer logo",
  "footer.brand_title": "Office name (footer)",
  "footer.brand_subtitle": "Office subtitle (footer)",
  "footer.left_links": "Footer left link",
  "footer.rows.0": "Footer link — row 1",
  "footer.rows.1": "Footer link — row 2",
  "footer.rows.2": "Footer link — row 3",
  "footer.copyright": "Copyright line",
  "footer.powered": "“Powered by” link",
};

/** The mobile view's own pieces, and the ones it names differently. */
const MOBILE_NAMES: Record<string, string> = {
  ...NAMES,
  "header.menu_button": "Menu button (☰)",
  "menu.items": "Menu item",
  "menu.links_title": "Menu — quick links heading",
  "menu.links": "Menu — quick link",
  "menu.connect": "Menu — “Connect with” text",
  "menu.social": "Menu — social icon",
  "document.viewer": "Document panel",
  "document.viewer.filename": "Document panel — file name",
  "document.viewer.button": "Document panel — Open button",
};

function namesFor(view: PageView): Record<string, string> {
  return view === "mobile" ? MOBILE_NAMES : NAMES;
}

/** What each entry of the verification record is called here. */
const ROW_NAMES: Record<RecordRowId, string> = {
  country: "Entry — Country",
  document_type: "Entry — Document Type",
  signed_by: "Entry — Previously signed by",
  signed_capacity: "Entry — Acting in capacity",
  seal_stamp: "Entry — Seal or stamp",
  certificate: "Certificate box",
  office_city: "Entry — Office City",
  issue_date: "Entry — Date",
  office_name: "Entry — Office Name",
  attestation_number: "Entry — Complete Number",
  officer: "Entry — Approving officer",
};

/** Which value each entry shows. */
const ROW_SOURCE: Record<RecordRowId, string> = {
  country: "the fixed value typed in below, the same for every document",
  document_type: "the document type typed into each upload",
  signed_by: "“Previously signed by” as typed into each upload",
  signed_capacity: "“Previous signed acting in capacity” as typed into each upload",
  seal_stamp: "“Bears the seal or stamp” as typed into each upload",
  certificate: "",
  office_city: "the office city typed into each upload",
  issue_date: "the document's date, written like “29th of October 2026”",
  office_name: "the office name typed into each upload",
  attestation_number: "the document's attestation number (generated or typed in, starting with the prefix in use)",
  officer: "the approving officer's name, with their designation under it and their signature beside them",
};

/** Text that may run over several lines (Enter makes a line break on the page). */
const MULTILINE = new Set(["hero.lead", "record.disclaimer", "result.missing_text"]);
/** Desktop lists whose names may be split over two lines, as in “Verify Document”. */
const LINEBREAK_LISTS = new Set(["nav.items", "header.top_links"]);
/** Links drawn with an icon after their name (the others never show one). */
const ICON_LISTS = new Set(["header.top_links", "nav.items", "menu.items", "menu.links"]);
const ICON_PATHS = new Set(["document.open", "cta.button", "footer.visit"]);

/** The grid a list's item widths are measured on, or null when the list sizes its items itself. */
function widthGrid(view: PageView, listPath: string): number | null {
  if (/^footer\.rows\.\d+$/.test(listPath)) return view === "desktop" ? 1062 : 360;
  if (view === "desktop" && (listPath === "nav.items" || listPath === "header.top_links")) return 1062;
  return null;
}

function nameOf(view: PageView, path: string, content: AnyContent): string {
  const names = namesFor(view);
  if (names[path]) return names[path];
  const rowId = path.startsWith("record.rows.") ? (path.slice("record.rows.".length) as RecordRowId) : null;
  if (rowId && ROW_NAMES[rowId]) return ROW_NAMES[rowId];
  const list = listOf(content, path);
  if (list && names[list.listPath]) return names[list.listPath];
  return path;
}

type OutlineItem = { path: string; label: string; hidden: boolean };
type OutlineGroup = { title: string; items: OutlineItem[]; add?: string[] };

/** The outline beside the preview: every piece of the page, hidden ones included. */
function outline(view: PageView, c: AnyContent): OutlineGroup[] {
  const names = namesFor(view);
  const t = (path: string): OutlineItem => {
    const v = getAt(c, path) as { hidden?: boolean } | undefined;
    return { path, label: names[path] ?? path, hidden: Boolean(v?.hidden) };
  };
  const list = (listPath: string, items: Array<{ id: string; hidden: boolean; text?: string; label?: string }>): OutlineItem[] =>
    items.map((i) => ({
      path: `${listPath}.${i.id}`,
      label: `${names[listPath] ?? listPath}: ${(i.text ?? i.label ?? "").replace(/\n/g, " ") || "(empty)"}`,
      hidden: i.hidden,
    }));

  const middle: OutlineGroup[] = [
    {
      title: "Hero",
      items: [
        ...list("hero.crumbs", c.hero.crumbs),
        t("hero.crumb_current"),
        t("hero.eyebrow"),
        t("hero.title"),
        t("hero.title_accent"),
        t("hero.lead"),
        t("hero.art"),
      ],
      add: ["hero.crumbs"],
    },
    {
      title: "Result banner",
      items: [t("result.found_title"), t("result.document_label"), t("result.issued_label"), t("result.missing_title"), t("result.missing_text")],
    },
    {
      title: "Verification record",
      items: [
        t("record.eyebrow"),
        t("record.title"),
        t("record.logo"),
        t("record.cert_title"),
        t("record.cert_subtitle"),
        ...c.record.rows.map((r) => ({
          path: `record.rows.${r.id}`,
          label: r.id === "certificate" ? `${ROW_NAMES[r.id]}: ${r.text || "(empty)"}` : `${r.number ? `${r.number} ` : ""}${r.text || "(empty)"}`,
          hidden: r.hidden,
        })),
        t("record.designation"),
        t("record.signature"),
        t("record.disclaimer"),
      ],
    },
  ];
  const end: OutlineGroup[] = [
    { title: "Bottom of the page", items: [t("cta.button"), t("cta.help_before"), t("cta.email"), t("cta.help_after")] },
    {
      title: "Footer",
      items: [
        t("footer.title"),
        t("footer.visit"),
        t("footer.logo"),
        t("footer.brand_title"),
        t("footer.brand_subtitle"),
        ...list("footer.left_links", c.footer.left_links),
        ...c.footer.rows.flatMap((row, i) => list(`footer.rows.${i}`, row)),
        t("footer.copyright"),
        t("footer.powered"),
      ],
      add: ["footer.left_links", ...c.footer.rows.map((_, i) => `footer.rows.${i}`)],
    },
  ];

  if (view === "mobile") {
    const m = c as MobileContent;
    return [
      { title: "Header", items: [t("header.logo"), t("header.title"), t("header.subtitle"), t("header.menu_button")] },
      {
        title: "Menu (opens from ☰)",
        items: [
          ...list("menu.items", m.menu.items),
          t("menu.links_title"),
          ...list("menu.links", m.menu.links),
          t("menu.connect"),
          ...list("menu.social", m.menu.social),
        ],
        add: ["menu.items", "menu.links", "menu.social"],
      },
      ...middle,
      {
        title: "Supporting document",
        items: [
          t("document.eyebrow"),
          t("document.title"),
          t("document.open"),
          { path: "document.viewer", label: names["document.viewer"], hidden: false },
          t("document.viewer.filename"),
          t("document.viewer.button"),
        ],
      },
      ...end,
    ];
  }

  const d = c as DesktopContent;
  return [
    {
      title: "Header",
      items: [
        t("header.logo"),
        t("header.title"),
        t("header.subtitle"),
        ...list("header.top_links", d.header.top_links),
        t("header.connect"),
        ...list("header.social", d.header.social),
      ],
      add: ["header.top_links", "header.social"],
    },
    { title: "Main menu", items: list("nav.items", d.nav.items), add: ["nav.items"] },
    ...middle,
    {
      title: "Supporting document",
      items: [t("document.eyebrow"), t("document.title"), t("document.open"), { path: "document.viewer", label: names["document.viewer"], hidden: false }],
    },
    ...end,
  ];
}

function isSocialList(listPath: string): boolean {
  return listPath === "header.social" || listPath === "menu.social";
}

/** A new item for a list, made like its neighbour. */
function blankItem(listPath: string, id: string, like?: PLink | PSocial): PLink | PSocial {
  if (isSocialList(listPath)) {
    const s = like as PSocial | undefined;
    return { id, icon: s?.icon ?? "website", label: "Website", href: "#", new_tab: true, hidden: false };
  }
  const l = like as PLink | undefined;
  return { id, text: "New link", href: "#", new_tab: l?.new_tab ?? false, hidden: false, icon: "none", width: null };
}

function idPrefix(listPath: string): string {
  return isSocialList(listPath) ? "social" : listPath.replace(/[^a-z0-9]+/gi, "-");
}

/** Phone widths the mobile preview can be shown at. The page scales to every one of them. */
const PHONES: Array<{ width: number; label: string }> = [
  { width: 320, label: "320 px · small phones (iPhone SE 1st gen)" },
  { width: 360, label: "360 px · the design (most Android phones)" },
  { width: 375, label: "375 px · iPhone SE 2/3, iPhone 8, mini" },
  { width: 390, label: "390 px · iPhone 12, 13, 14" },
  { width: 393, label: "393 px · iPhone 15, 16, Pixel" },
  { width: 412, label: "412 px · Galaxy S Ultra, Pixel Pro" },
  { width: 430, label: "430 px · iPhone Plus / Pro Max" },
  { width: 480, label: "480 px · large phones, foldables" },
];

/* ---------------- The editor ---------------- */

interface LoadResult {
  desktop: { content: DesktopContent; updated_at: string | null };
  mobile: { content: MobileContent; updated_at: string | null };
  defaults: { desktop: DesktopContent; mobile: MobileContent };
  assets: Record<string, string>;
  table_ready: boolean;
}

/** New M's saved page, both views, with Appo's own copies of its logos and favicons. */
interface NewMCopy {
  desktop: DesktopContent;
  mobile: MobileContent;
  assets: Record<string, string>;
  saved: Record<PageView, boolean>;
  images: { copied: number; missing: number };
}

/** One view's content: as saved, as being edited, and the edits that can be undone and redone. */
interface ViewDoc<T> {
  saved: T;
  savedAt: string | null;
  content: T;
  past: T[];
  future: T[];
}

interface Docs {
  desktop: ViewDoc<DesktopContent>;
  mobile: ViewDoc<MobileContent>;
}

function fresh<T>(content: T, savedAt: string | null): ViewDoc<T> {
  return { saved: content, savedAt, content, past: [], future: [] };
}

function isDirty(d: ViewDoc<AnyContent>): boolean {
  return JSON.stringify(d.content) !== JSON.stringify(d.saved);
}

const VIEW_LABEL: Record<PageView, string> = { desktop: "Desktop", mobile: "Mobile" };

export function AppoPageEditor() {
  const { toast } = useToast();
  const [view, setView] = useState<PageView>("desktop");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tableReady, setTableReady] = useState(true);

  const [docs, setDocs] = useState<Docs | null>(null);
  const [assets, setAssets] = useState<Record<string, string>>({});

  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<null | "reset" | "discard" | "copy" | "new-m">(null);
  const [copyingNewM, setCopyingNewM] = useState(false);

  const [record, setRecord] = useState<PageRecord>(SAMPLE_RECORD);
  const [recordLabel, setRecordLabel] = useState("Sample values from the design");
  const [showMissing, setShowMissing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  /** Mobile preview: the phone width shown, and the menu held open by the admin. */
  const [phone, setPhone] = useState(360);
  const [menuPinned, setMenuPinned] = useState(false);

  const previewRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<LoadResult>("/api/admin/appo/page");
      // Read through the same checks as the server, so anything missing shows the design's default.
      setDocs({
        desktop: fresh(cleanDesktop(r.desktop.content), r.desktop.updated_at),
        mobile: fresh(cleanMobile(r.mobile.content), r.mobile.updated_at),
      });
      setAssets(r.assets);
      setTableReady(r.table_ready);
      setLoadError(null);
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The newest document fills the preview, so the page is designed against real values.
  useEffect(() => {
    (async () => {
      try {
        const page = await api<Paged<AppoRecord>>(`/api/admin/appo${qs({ limit: 1 })}`);
        const first = page.items[0];
        if (first) await pickRecord(first);
      } catch {
        // The sample values stay.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pickRecord(r: AppoRecord | null) {
    setPickerOpen(false);
    if (!r) {
      setRecord(SAMPLE_RECORD);
      setRecordLabel("Sample values from the design");
      return;
    }
    try {
      const res = await api<{ record: PageRecord }>(`/api/admin/appo/page/record${qs({ id: r.id })}`);
      setRecord(res.record);
      setRecordLabel(`${r.attestation_number} · ${formatIssued(r.issue_date)}`);
    } catch (e) {
      toast(errorMessage(e), "danger");
    }
  }

  const dirtyDesktop = useMemo(() => (docs ? isDirty(docs.desktop) : false), [docs]);
  const dirtyMobile = useMemo(() => (docs ? isDirty(docs.mobile) : false), [docs]);
  const dirty = dirtyDesktop || dirtyMobile;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /** Every change to a view goes through here, so it can be undone. */
  const edit = useCallback((v: PageView, fn: (c: AnyContent) => AnyContent) => {
    setDocs((d) => {
      if (!d) return d;
      const cur = d[v] as ViewDoc<AnyContent>;
      const next = fn(cur.content);
      if (next === cur.content) return d;
      return { ...d, [v]: { ...cur, content: next, past: [...cur.past.slice(-99), cur.content], future: [] } } as Docs;
    });
  }, []);

  const update = useCallback((path: string, value: unknown) => edit(view, (c) => setAt(c, path, value)), [edit, view]);

  /** Remembers the view as it is, so a drag that follows is one step for Undo. */
  const checkpoint = useCallback((v: PageView) => {
    setDocs((d) => {
      if (!d) return d;
      const cur = d[v] as ViewDoc<AnyContent>;
      return { ...d, [v]: { ...cur, past: [...cur.past.slice(-99), cur.content], future: [] } } as Docs;
    });
  }, []);

  /** Changes a view while something is being dragged, without a step for Undo each time the pointer moves. */
  const liveEdit = useCallback((v: PageView, fn: (c: AnyContent) => AnyContent) => {
    setDocs((d) => {
      if (!d) return d;
      const cur = d[v] as ViewDoc<AnyContent>;
      return { ...d, [v]: { ...cur, content: fn(cur.content) } } as Docs;
    });
  }, []);

  function undo() {
    setDocs((d) => {
      if (!d) return d;
      const cur = d[view] as ViewDoc<AnyContent>;
      if (!cur.past.length) return d;
      return {
        ...d,
        [view]: { ...cur, content: cur.past[cur.past.length - 1], past: cur.past.slice(0, -1), future: [cur.content, ...cur.future] },
      } as Docs;
    });
  }

  function redo() {
    setDocs((d) => {
      if (!d) return d;
      const cur = d[view] as ViewDoc<AnyContent>;
      if (!cur.future.length) return d;
      return { ...d, [view]: { ...cur, content: cur.future[0], past: [...cur.past, cur.content], future: cur.future.slice(1) } } as Docs;
    });
  }

  function switchView(v: PageView) {
    if (v === view) return;
    setView(v);
    setSelected(null);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el?.closest("input, textarea, select, [contenteditable=true]")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      } else if (e.key === "Escape") {
        setSelected(null);
        setMenuPinned(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ---------- Lists ---------- */

  function addTo(listPath: string, after?: string) {
    if (!docs) return;
    const current = (getAt(docs[view].content, listPath) as Array<PLink | PSocial> | undefined) ?? [];
    if (current.length >= MAX_ITEMS) {
      toast(`A list holds at most ${MAX_ITEMS} items. Delete or hide one first.`, "info");
      return;
    }
    const id = newId(idPrefix(listPath));
    edit(view, (c) => {
      const list = (getAt(c, listPath) as Array<PLink | PSocial> | undefined) ?? [];
      const at = after ? list.findIndex((x) => x.id === after) : -1;
      const like = at >= 0 ? list[at] : list[list.length - 1];
      const next = list.slice();
      next.splice(at >= 0 ? at + 1 : next.length, 0, blankItem(listPath, id, like));
      return setAt(c, listPath, next);
    });
    reveal(`${listPath}.${id}`);
  }

  function duplicate(path: string) {
    if (!docs) return;
    const l = listOf(docs[view].content, path);
    if (!l) return;
    const current = getAt(docs[view].content, l.listPath) as Array<PLink | PSocial>;
    if (current.length >= MAX_ITEMS) {
      toast(`A list holds at most ${MAX_ITEMS} items. Delete or hide one first.`, "info");
      return;
    }
    const id = newId(idPrefix(l.listPath));
    edit(view, (c) => {
      const list = getAt(c, l.listPath) as Array<PLink | PSocial>;
      const i = list.findIndex((x) => x.id === l.itemId);
      if (i < 0) return c;
      const next = list.slice();
      next.splice(i + 1, 0, { ...list[i], id });
      return setAt(c, l.listPath, next);
    });
    reveal(`${l.listPath}.${id}`);
  }

  function move(path: string, dir: -1 | 1) {
    if (!docs) return;
    const l = listOf(docs[view].content, path);
    if (!l) return;
    edit(view, (c) => {
      const list = (getAt(c, l.listPath) as Array<PLink | PSocial>).slice();
      const i = list.findIndex((x) => x.id === l.itemId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return c;
      [list[i], list[j]] = [list[j], list[i]];
      return setAt(c, l.listPath, list);
    });
  }

  function remove(path: string) {
    if (!docs) return;
    const l = listOf(docs[view].content, path);
    if (!l) return;
    edit(view, (c) => setAt(c, l.listPath, (getAt(c, l.listPath) as Array<PLink | PSocial>).filter((x) => x.id !== l.itemId)));
    setSelected(null);
  }

  /* ---------- Saving ---------- */

  async function save() {
    if (!docs || saving) return;
    const changed = (["desktop", "mobile"] as const).filter((v) => isDirty(docs[v] as ViewDoc<AnyContent>));
    if (!changed.length) {
      toast("Nothing has changed since the last save", "info");
      return;
    }
    setSaving(true);
    try {
      for (const v of changed) {
        const cur = docs[v] as ViewDoc<AnyContent>;
        const other = docs[v === "desktop" ? "mobile" : "desktop"] as ViewDoc<AnyContent>;
        const r = await api<{ content: AnyContent; updated_at: string; assets?: Record<string, string> }>("/api/admin/appo/page", {
          method: "PUT",
          // The other view's logos, saved or not, are kept in storage by this save.
          json: { view: v, content: cur.content, base_updated_at: cur.savedAt, keep: imageKeys(other.content) },
        });
        const clean = v === "desktop" ? cleanDesktop(r.content) : cleanMobile(r.content);
        setDocs((d) => {
          if (!d) return d;
          const now = d[v] as ViewDoc<AnyContent>;
          // Edits made while the save was on its way stay unsaved.
          const content = JSON.stringify(now.content) === JSON.stringify(cur.content) ? clean : now.content;
          return { ...d, [v]: { ...now, saved: clean, savedAt: r.updated_at, content } } as Docs;
        });
        if (r.assets) setAssets((a) => ({ ...a, ...r.assets }));
      }
      toast(
        changed.length === 2
          ? "Both views saved. Every verification link shows them now."
          : `${VIEW_LABEL[changed[0]]} view saved. Every verification link shows it now.`,
      );
    } catch (e) {
      toast(errorMessage(e), "danger");
      if (e instanceof ClientError && e.status === 409) void load();
    } finally {
      setSaving(false);
    }
  }

  /**
   * Both views take New M's page as it is saved now, as unsaved changes: nothing reaches visitors until
   * Save, and Undo brings each view back. The server has already copied its logos and favicons to Appo.
   */
  async function copyFromNewM() {
    if (copyingNewM) return;
    setCopyingNewM(true);
    try {
      const r = await api<NewMCopy>("/api/admin/appo/page/from-new-m", { method: "POST" });
      setAssets((a) => ({ ...a, ...r.assets }));
      // The verification record's entries are Appo's own (New M's record has others), so they stay as they are.
      edit("desktop", (c) => keepRecordEntries(cleanDesktop(r.desktop), c as DesktopContent));
      edit("mobile", (c) => keepRecordEntries(cleanMobile(r.mobile), c as MobileContent));
      setSelected(null);
      setMenuPinned(false);
      setConfirm(null);
      const neverSaved = PAGE_VIEWS.filter((v) => !r.saved[v]).map((v) => VIEW_LABEL[v].toLowerCase());
      const notes = [
        "New M's design is copied into both views; the verification record's entries and the note under them stay Appo's own. Check the preview, then press Save.",
      ];
      if (r.images.missing) {
        notes.push(
          `${r.images.missing} of its images ${r.images.missing === 1 ? "was" : "were"} not in storage, so the design's own shows there.`,
        );
      }
      if (neverSaved.length) notes.push(`New M has never saved its ${neverSaved.join(" or ")} view, so that view is the design as made.`);
      toast(notes.join(" "), r.images.missing ? "info" : "ok");
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setCopyingNewM(false);
    }
  }

  /* ---------- Clicks in the preview ---------- */

  const menuOpen = view === "mobile" && (menuPinned || Boolean(selected?.startsWith("menu.")));

  /** A drag of a set of text inside the picked record entry, under way. */
  const textDrag = useRef<{
    id: number;
    x: number;
    y: number;
    /** Screen pixels in one design pixel of the view. */
    unitPx: number;
    rowPath: string;
    part: RowPart;
    from: PartMove;
    moved: boolean;
  } | null>(null);
  /** Set when a drag ends, so the click that follows does not pick something else. */
  const dragEnded = useRef(false);

  /**
   * Pressing on the number, the words or the value (or the officer's designation or signature) of the
   * record entry open in the side panel starts moving it within its box. The move is in the view's
   * design pixels, like the rest of the page, so it keeps its place at every window or phone width.
   */
  function onPreviewPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || !docs) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-move]");
    if (!el) return;
    const [rowId, part] = (el.dataset.move as string).split(":") as [string, RowPart];
    const rowPath = `record.rows.${rowId}`;
    if (selected !== rowPath) return;
    const row = getAt(docs[view].content, rowPath) as RecordRow | undefined;
    const box = el.closest<HTMLElement>(`[data-edit="${rowPath}"]`);
    if (!row || !box) return;
    // One design pixel of this view, measured where the entry is drawn.
    const probe = document.createElement("span");
    probe.style.cssText = `position:absolute;visibility:hidden;width:calc(var(${view === "mobile" ? "--mu" : "--u"}) * 100)`;
    box.appendChild(probe);
    const unitPx = probe.getBoundingClientRect().width / 100 || 1;
    probe.remove();
    e.preventDefault();
    textDrag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, unitPx, rowPath, part, from: row.moves[part] ?? { x: 0, y: 0 }, moved: false };
    const v = view;

    const onMove = (ev: PointerEvent) => {
      const d = textDrag.current;
      if (!d || ev.pointerId !== d.id) return;
      const sx = ev.clientX - d.x;
      const sy = ev.clientY - d.y;
      if (!d.moved) {
        if (Math.abs(sx) < 3 && Math.abs(sy) < 3) return;
        d.moved = true;
        checkpoint(v);
      }
      const clamp = (n: number) => Math.round(Math.min(MAX_MOVE, Math.max(-MAX_MOVE, n)) * 10) / 10;
      const next = { x: clamp(d.from.x + sx / d.unitPx), y: clamp(d.from.y + sy / d.unitPx) };
      liveEdit(v, (c) => {
        const r = getAt(c, d.rowPath) as RecordRow;
        const moves = { ...r.moves };
        if (next.x === 0 && next.y === 0) delete moves[d.part];
        else moves[d.part] = next;
        return setAt(c, `${d.rowPath}.moves`, moves);
      });
    };
    const onUp = (ev: PointerEvent) => {
      const d = textDrag.current;
      if (!d || ev.pointerId !== d.id) return;
      if (d.moved) dragEnded.current = true;
      textDrag.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  function onPreviewClick(e: React.MouseEvent<HTMLDivElement>) {
    if (dragEnded.current) {
      // The end of a drag, not a click: nothing else is picked.
      dragEnded.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const target = e.target as HTMLElement;
    const add = target.closest<HTMLElement>("[data-add]");
    const hit = target.closest<HTMLElement>("[data-edit]");
    if (add || hit || target.closest("a, button")) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (add) {
      addTo(add.dataset.add as string);
      return;
    }
    if (!hit) return;
    const path = hit.dataset.edit as string;
    if (path === "header.menu_button") {
      // The ☰ button opens and closes the menu here too, so its items can be clicked and edited.
      setMenuPinned(!menuOpen);
    }
    setSelected(path);
  }

  function reveal(path: string) {
    setSelected(path);
    window.setTimeout(() => {
      const el = previewRef.current?.querySelector(`[data-edit="${CSS.escape(path)}"]`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 60);
  }

  /* ---------- Render ---------- */

  if (loadError) {
    return (
      <Alert tone="danger">
        {loadError}{" "}
        <button type="button" className="underline font-medium" onClick={() => void load()}>
          Try again
        </button>
      </Alert>
    );
  }
  if (!docs) return <Loading />;

  const active = docs[view] as ViewDoc<AnyContent>;
  const content = active.content;
  const desktop = docs.desktop.content;
  const mobile = docs.mobile.content;
  const shownRecord = showMissing ? null : record;
  const unsavedViews = [dirtyDesktop && "Desktop", dirtyMobile && "Mobile"].filter(Boolean).join(" and ");

  const inspector = selected ? (
    <Inspector
      key={`${view}:${selected}`}
      view={view}
      path={selected}
      content={content}
      assets={assets}
      onChange={update}
      onClose={() => setSelected(null)}
      onMove={(d) => move(selected, d)}
      onDuplicate={() => duplicate(selected)}
      onRemove={() => remove(selected)}
      onAddAfter={() => {
        const l = listOf(content, selected);
        if (l) addTo(l.listPath, l.itemId);
      }}
      onUploaded={(key, url) => setAssets((a) => ({ ...a, [key]: url }))}
      onPick={reveal}
      menuOpen={menuOpen}
      onMenuOpen={setMenuPinned}
    />
  ) : (
    <Overview
      view={view}
      content={content}
      assets={assets}
      onChange={update}
      onPick={reveal}
      onAdd={addTo}
      onCopyFromDesktop={() => setConfirm("copy")}
      onUploaded={(key, url) => setAssets((a) => ({ ...a, [key]: url }))}
    />
  );

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[12.5px] text-text-muted">
            <Link href="/admin/appo" className="hover:underline">
              Appo
            </Link>{" "}
            / Verification page
          </div>
          <h1 className="text-lg font-semibold leading-tight mt-0.5">Verification page design</h1>
          <p className="text-text-muted text-sm mt-1 max-w-3xl">
            This is the page every Appo verification link opens — the desktop view on computers and the mobile view on
            phones. Click any text, button, link, tab or logo on it to change its wording, where it leads, or hide it; the
            document&apos;s own values fill in by themselves. Text and links are saved in the database, logos in R2.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dirty ? (
            <Badge tone="warn">Unsaved changes · {unsavedViews}</Badge>
          ) : active.savedAt ? (
            <Badge tone="ok">
              {VIEW_LABEL[view]} saved {formatDateTime(active.savedAt)}
            </Badge>
          ) : (
            <Badge>Design defaults</Badge>
          )}
          <Button icon={<Undo2 className="size-4" />} onClick={undo} disabled={!active.past.length} title="Undo (Ctrl+Z)">
            Undo
          </Button>
          <Button icon={<Redo2 className="size-4" />} onClick={redo} disabled={!active.future.length} title="Redo (Ctrl+Shift+Z)">
            Redo
          </Button>
          <Button onClick={() => setConfirm("discard")} disabled={!dirty}>
            Discard changes
          </Button>
          <Button icon={<Copy className="size-4" />} onClick={() => setConfirm("new-m")} title="Both views take New M's saved page design">
            Copy New M&apos;s design
          </Button>
          <Button icon={<RotateCcw className="size-4" />} onClick={() => setConfirm("reset")}>
            Reset {view} to design
          </Button>
          <Button variant="primary" icon={<Save className="size-4" />} loading={saving} onClick={() => void save()} disabled={!dirty || !tableReady}>
            Save
          </Button>
        </div>
      </div>

      {!tableReady ? (
        <Alert tone="warn">
          The page design table is not in the database yet, so changes cannot be saved. Run <span className="font-mono">supabase/appo.sql</span>{" "}
          in Supabase → SQL Editor, then reload this page. Until then every link shows the design as it is below.
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-b">
        <TabButton active={view === "desktop"} onClick={() => switchView("desktop")} icon={<Monitor className="size-4" />} dot={dirtyDesktop}>
          Desktop view
        </TabButton>
        <TabButton active={view === "mobile"} onClick={() => switchView("mobile")} icon={<Smartphone className="size-4" />} dot={dirtyMobile}>
          Mobile view
        </TabButton>
        <div className="ml-auto flex flex-wrap items-center gap-2 pb-1.5">
          <span className="text-[12.5px] text-text-muted">Preview with:</span>
          <div className="relative">
            <Button size="sm" icon={<Search className="size-3.5" />} onClick={() => setPickerOpen((o) => !o)}>
              <span className="max-w-[16rem] truncate">{recordLabel}</span>
            </Button>
            {pickerOpen ? <RecordPicker onPick={pickRecord} onClose={() => setPickerOpen(false)} /> : null}
          </div>
          <Checkbox label="Show the “no matching record” page" checked={showMissing} onChange={(e) => setShowMissing(e.target.checked)} />
        </div>
      </div>

      {view === "desktop" ? (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px] items-start">
          <div className="min-w-0 rounded-md border bg-surface overflow-hidden">
            <div className="flex items-center gap-2 px-3 h-9 border-b bg-surface-2 text-[12.5px] text-text-muted">
              <MousePointer2 className="size-3.5" />
              Click anything to edit it · hidden pieces are striped · <span className="font-medium text-text">+</span> adds an item to a list
            </div>
            <div
              ref={previewRef}
              className="max-h-[calc(100vh-14rem)] overflow-y-auto"
              onClickCapture={onPreviewClick}
              onPointerDownCapture={onPreviewPointerDown}
            >
              <VerifyPage content={desktop} record={shownRecord} assets={assets} editor={{ selected }} />
            </div>
          </div>
          <aside className="xl:sticky xl:top-4 rounded-md border bg-surface min-w-0">{inspector}</aside>
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px] items-start">
          <div className="min-w-0 rounded-md border bg-surface overflow-hidden">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-1.5 min-h-9 border-b bg-surface-2 text-[12.5px] text-text-muted">
              <span className="inline-flex items-center gap-2">
                <MousePointer2 className="size-3.5" />
                Click anything to edit it · click <MenuIcon className="size-3.5" aria-label="the menu button" /> to open the menu and edit its items
              </span>
              <div className="ml-auto flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-1.5">
                  <span>Phone width</span>
                  <Select
                    value={phone}
                    onChange={(e) => setPhone(Number(e.target.value))}
                    style={{ width: "auto", padding: "3px 28px 3px 8px", fontSize: 12.5 }}
                  >
                    {PHONES.map((p) => (
                      <option key={p.width} value={p.width}>
                        {p.label}
                      </option>
                    ))}
                  </Select>
                </label>
                <Checkbox
                  label="Menu open"
                  checked={menuOpen}
                  onChange={(e) => {
                    setMenuPinned(e.target.checked);
                    if (!e.target.checked && selected?.startsWith("menu.")) setSelected(null);
                  }}
                />
              </div>
            </div>
            <div className="flex justify-center bg-[#e7ebee] px-3 py-4 overflow-x-auto">
              <div className="shrink-0 rounded-[2.4rem] shadow-xl overflow-hidden" style={{ border: "10px solid #1b2a41", background: "#1b2a41" }}>
                <div
                  ref={previewRef}
                  onClickCapture={onPreviewClick}
                  onPointerDownCapture={onPreviewPointerDown}
                  className="overflow-y-auto overflow-x-hidden bg-white rounded-[1.6rem] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  style={{ width: phone, height: "max(32rem, calc(100vh - 17rem))" }}
                >
                  <MobilePage content={mobile} record={shownRecord} assets={assets} editor={{ selected, menuOpen }} />
                </div>
              </div>
            </div>
          </div>
          <aside className="xl:sticky xl:top-4 rounded-md border bg-surface min-w-0">{inspector}</aside>
        </div>
      )}

      <ConfirmDialog
        open={confirm === "discard"}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setDocs((d) => (d ? { desktop: fresh(d.desktop.saved, d.desktop.savedAt), mobile: fresh(d.mobile.saved, d.mobile.savedAt) } : d));
          setSelected(null);
          setConfirm(null);
        }}
        title="Discard your changes?"
        confirmLabel="Discard"
        danger
        message={`Everything changed since the last save is undone (${unsavedViews || "nothing"} view). The page visitors see is not affected.`}
      />
      <ConfirmDialog
        open={confirm === "reset"}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          edit(view, () => structuredClone(view === "desktop" ? DEFAULT_DESKTOP : DEFAULT_MOBILE));
          setSelected(null);
          setConfirm(null);
        }}
        title={`Reset the ${view} view to the design?`}
        confirmLabel="Reset"
        message={
          <>
            Every text, link, button and logo of the {view} view goes back to the original {view} design; the other view
            stays as it is. Nothing changes for visitors until you press <b>Save</b>, and <b>Undo</b> brings your version
            back. Logos no longer used by either view are deleted from R2 when you save.
          </>
        }
      />
      <ConfirmDialog
        open={confirm === "new-m"}
        onClose={() => (copyingNewM ? undefined : setConfirm(null))}
        onConfirm={copyFromNewM}
        loading={copyingNewM}
        title="Copy New M's page design into Appo?"
        confirmLabel="Copy"
        message={
          <>
            Both views — desktop and mobile — take New M&apos;s verification page as it is saved now: every text, link,
            button, tab, menu item and logo, the favicon and the PDF tab&apos;s favicon. Appo gets its own copies of the
            logos and favicons in R2, so changing either page later never touches the other. Changes not yet saved in New
            M&apos;s editor are not included.
            <br />
            <br />
            <b>Not copied:</b> the entries of the verification record — Country, Document Type, 2 to 8, the certificate box,
            the approving officer&apos;s designation and signature — and the note under them (&ldquo;This verification
            confirms…&rdquo;). They are Appo&apos;s own, so they stay exactly as they are. Nothing changes for visitors until you press <b>Save</b>, and <b>Undo</b> brings back your version of
            each view.
          </>
        }
      />
      <ConfirmDialog
        open={confirm === "copy"}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          edit("mobile", (m) => mobileFromDesktop(desktop, m as MobileContent));
          setSelected(null);
          setConfirm(null);
          toast("The desktop wording, links and logos are copied in. Check the preview, then Save.");
        }}
        title="Copy the desktop view into the mobile view?"
        confirmLabel="Copy"
        message={
          <>
            The mobile view takes the desktop view&apos;s texts, links, menu items, top buttons (as the menu&apos;s quick
            links), social icons and logos, as they are now in the editor. What only phones have stays: the menu button,
            the document panel, the phone widths of the footer links and your notes. <b>Undo</b> brings the mobile view
            back.
          </>
        }
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  dot,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "inline-flex items-center gap-2 px-3 h-9 -mb-px border-b-2 text-sm font-medium",
        active ? "border-teal-600 text-text" : "border-transparent text-text-muted hover:text-text",
      )}
    >
      {icon}
      {children}
      {dot ? <span className="size-1.5 rounded-full bg-amber-500" title="Unsaved changes" /> : null}
    </button>
  );
}

/* ---------------- Picking the preview document ---------------- */

function RecordPicker({ onPick, onClose }: { onPick: (r: AppoRecord | null) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<AppoRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(async () => {
      try {
        const r = await api<Paged<AppoRecord>>(`/api/admin/appo${qs({ q: q.trim(), limit: 12 })}`);
        setItems(r.items);
        setError(null);
      } catch (e) {
        setError(errorMessage(e));
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [q]);

  return (
    <div className="absolute right-0 top-full mt-1 z-30 w-[22rem] rounded-md border bg-surface shadow-xl p-2">
      <div className="flex items-center gap-1.5">
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number, type, office, officer…" />
        <button type="button" className="p-1 text-text-muted hover:text-text" onClick={onClose} aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      {error ? <p className="text-[12.5px] text-danger-600 mt-2">{error}</p> : null}
      <div className="mt-2 max-h-72 overflow-y-auto">
        <button type="button" className="w-full text-left px-2 py-1.5 rounded hover:bg-surface-2 text-[13px]" onClick={() => onPick(null)}>
          <span className="font-medium">Sample values from the design</span>
        </button>
        {items === null ? <p className="px-2 py-1.5 text-[12.5px] text-text-muted">Loading…</p> : null}
        {items?.length === 0 ? <p className="px-2 py-1.5 text-[12.5px] text-text-muted">No documents found.</p> : null}
        {items?.map((r) => (
          <button key={r.id} type="button" className="w-full text-left px-2 py-1.5 rounded hover:bg-surface-2" onClick={() => onPick(r)}>
            <div className="font-mono text-[12.5px] font-medium">{r.attestation_number}</div>
            <div className="text-[12px] text-text-muted truncate">
              {formatIssued(r.issue_date)} · {r.document_type || "—"} · {r.domain_hostname}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Nothing selected: page settings and outline ---------------- */

function Overview({
  view,
  content,
  assets,
  onChange,
  onPick,
  onAdd,
  onCopyFromDesktop,
  onUploaded,
}: {
  view: PageView;
  content: AnyContent;
  assets: Record<string, string>;
  onChange: (path: string, value: unknown) => void;
  onPick: (path: string) => void;
  onAdd: (listPath: string) => void;
  onCopyFromDesktop: () => void;
  onUploaded: (key: string, url: string) => void;
}) {
  const groups = outline(view, content);
  const names = namesFor(view);
  return (
    <div>
      <div className="px-4 py-3 border-b">
        <h2 className="text-sm font-semibold">{view === "mobile" ? "Mobile page settings" : "Page settings"}</h2>
        <div className="mt-3 space-y-3">
          {view === "desktop" ? (
            <>
              <Field label="Browser tab title" hint="Shown on the browser tab and in bookmarks, on computers and phones alike.">
                <Input value={(content as DesktopContent).meta.title} onChange={(e) => onChange("meta.title", e.target.value)} />
              </Field>
              <FaviconField
                value={(content as DesktopContent).meta.favicon}
                title={(content as DesktopContent).meta.title}
                assets={assets}
                onChange={(v) => onChange("meta.favicon", v)}
                onUploaded={onUploaded}
              />
              <PdfFaviconField content={content as DesktopContent} assets={assets} onChange={onChange} onUploaded={onUploaded} />
            </>
          ) : null}
          <Checkbox
            label="Animate the page as it opens"
            description={
              view === "mobile"
                ? "Headings and cards rise in and the shield glows. Phones set to reduce motion never see it."
                : "Headings rise in, the hero badges float and the shield glows. Visitors who ask their computer for less motion never see it."
            }
            checked={content.meta.animations}
            onChange={(e) => onChange("meta.animations", e.target.checked)}
          />
          {view === "mobile" ? (
            <>
              <p className="text-[12.5px] text-text-muted">
                Phones and windows narrower than 768 px show this view; wider screens show the desktop view. The browser
                tab title is set under Desktop view and serves both.
              </p>
              <Button size="sm" icon={<Copy className="size-3.5" />} onClick={onCopyFromDesktop}>
                Copy wording from the desktop view
              </Button>
              <Field label="Notes" hint="Kept with the mobile view for whoever works on it. Never shown on the page.">
                <Textarea rows={3} value={(content as MobileContent).note} onChange={(e) => onChange("note", e.target.value)} />
              </Field>
            </>
          ) : null}
        </div>
      </div>
      <div className="px-4 py-3">
        <h2 className="text-sm font-semibold">Everything on the page</h2>
        <p className="text-[12.5px] text-text-muted mt-0.5">Click a piece here or on the page to edit it.</p>
        <div className="mt-2 max-h-[calc(100vh-26rem)] min-h-40 overflow-y-auto -mx-2">
          {groups.map((g) => (
            <div key={g.title} className="mb-2">
              <div className="px-2 py-1 text-[11.5px] font-semibold uppercase tracking-wide text-text-faint">{g.title}</div>
              {g.items.map((i) => (
                <button
                  key={i.path}
                  type="button"
                  onClick={() => onPick(i.path)}
                  className="w-full flex items-center gap-2 px-2 py-1 rounded text-left text-[13px] hover:bg-surface-2"
                >
                  <span className={cx("min-w-0 flex-1 truncate", i.hidden && "text-text-faint line-through")}>{i.label}</span>
                  {i.hidden ? <EyeOff className="size-3.5 text-text-faint shrink-0" /> : null}
                </button>
              ))}
              {g.add?.map((listPath) => (
                <button
                  key={listPath}
                  type="button"
                  onClick={() => onAdd(listPath)}
                  className="w-full flex items-center gap-2 px-2 py-1 rounded text-left text-[12.5px] text-teal-700 hover:bg-teal-50"
                >
                  <Plus className="size-3.5" /> Add {(names[listPath] ?? "item").toLowerCase()}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- One piece selected ---------------- */

function Inspector({
  view,
  path,
  content,
  assets,
  onChange,
  onClose,
  onMove,
  onDuplicate,
  onRemove,
  onAddAfter,
  onUploaded,
  onPick,
  menuOpen,
  onMenuOpen,
}: {
  view: PageView;
  path: string;
  content: AnyContent;
  assets: Record<string, string>;
  onChange: (path: string, value: unknown) => void;
  onClose: () => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onAddAfter: () => void;
  onUploaded: (key: string, url: string) => void;
  onPick: (path: string) => void;
  menuOpen: boolean;
  onMenuOpen: (open: boolean) => void;
}) {
  const value = getAt(content, path);
  const list = listOf(content, path);
  const listItems = list ? (getAt(content, list.listPath) as Array<{ id: string }>) : null;
  const index = list && listItems ? listItems.findIndex((x) => x.id === list.itemId) : -1;
  /** The record's entries are a fixed set: they can be moved and hidden, not added, copied or deleted. */
  const fixedList = list?.listPath === "record.rows";
  const set = (field: string, v: unknown) => onChange(`${path}.${field}`, v);

  let body: ReactNode = <p className="text-sm text-text-muted">This piece has no settings.</p>;
  if (value === undefined) {
    body = <p className="text-sm text-text-muted">This piece is no longer on the page.</p>;
  } else if (path === "document.viewer") {
    body =
      view === "desktop" ? (
        <ViewerFields content={content as DesktopContent} onChange={onChange} />
      ) : (
        <MobileViewerFields content={content as MobileContent} onChange={onChange} onPick={onPick} />
      );
  } else if (path === "document.viewer.filename" || path === "document.viewer.button") {
    const pagesMode = view === "mobile" && (content as MobileContent).document.viewer.mode === "pages";
    body = (
      <>
        {path === "document.viewer.button" ? (
          <TextFields value={value as PText} set={set} multiline={false} />
        ) : (
          <VisibleToggle hidden={(value as { hidden: boolean }).hidden} onChange={(h) => set("hidden", h)} />
        )}
        <Alert tone="info">
          {path === "document.viewer.button"
            ? "It opens the document's PDF in a new tab, where the phone shows it in its own PDF viewer."
            : "The name of each document's PDF file, shown under the PDF icon. It changes with every document."}
        </Alert>
        {pagesMode ? (
          <Alert tone="warn">
            The document panel is set to show the PDF&apos;s pages, so this shows only when a PDF cannot be drawn.{" "}
            <button type="button" className="underline font-medium" onClick={() => onPick("document.viewer")}>
              Change the panel
            </button>
          </Alert>
        ) : null}
      </>
    );
  } else if (path === "header.menu_button") {
    body = <MenuButtonFields value={value as PText} set={set} menuOpen={menuOpen} onMenuOpen={onMenuOpen} />;
  } else if (path === "record.rows.certificate") {
    body = (
      <CertificateFields
        view={view}
        row={value as RecordRow}
        style={content.record.certificate}
        set={set}
        setStyle={(field, v) => onChange(`record.certificate.${field}`, v)}
        onResetStyle={() => onChange("record.certificate", { ...(view === "mobile" ? DEFAULT_MOBILE_CERTIFICATE : DEFAULT_CERTIFICATE) })}
      />
    );
  } else if (path.startsWith("record.rows.")) {
    body = <RowFields row={value as RecordRow} set={set} />;
  } else if (path === "record.designation" || path === "record.signature") {
    body = (
      <>
        <VisibleToggle hidden={(value as { hidden: boolean }).hidden} onChange={(h) => set("hidden", h)} />
        <Alert tone="info">
          {path === "record.signature"
            ? "The signature image belongs to the approving officer picked for each document (saved under Appo → Saved values)."
            : "The designation belongs to the approving officer picked for each document."}
        </Alert>
      </>
    );
  } else if (path === "hero.art") {
    body = (
      <>
        <VisibleToggle hidden={(value as { hidden: boolean }).hidden} onChange={(h) => set("hidden", h)} />
        <p className="text-[12.5px] text-text-muted">
          {view === "mobile" ? "The shield badge and the circles in the hero." : "The circles, shield and badges on the right of the hero."}
        </p>
      </>
    );
  } else if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if ("key" in v && "alt" in v) {
      body = <ImageFields path={path} value={value as PImage} assets={assets} set={set} onChange={onChange} onUploaded={onUploaded} />;
    } else if ("icon" in v && "label" in v && !("text" in v)) {
      body = <SocialFields value={value as PSocial} set={set} />;
    } else if ("id" in v && "text" in v) {
      body = (
        <LinkFields
          path={path}
          value={value as PLink}
          set={set}
          multiline={view === "desktop" && Boolean(list && LINEBREAK_LISTS.has(list.listPath))}
          grid={list ? widthGrid(view, list.listPath) : null}
          showIcon={Boolean((list && ICON_LISTS.has(list.listPath)) || ICON_PATHS.has(path))}
        />
      );
    } else if ("href" in v && "text" in v) {
      body = <LinkTextFields value={value as PLinkText} set={set} />;
    } else if ("text" in v) {
      body = <TextFields value={value as PText} set={set} multiline={MULTILINE.has(path)} />;
    }
  }

  return (
    <div>
      <div className="flex items-start gap-2 px-4 py-3 border-b">
        <div className="min-w-0 flex-1">
          <div className="text-[11.5px] font-semibold uppercase tracking-wide text-text-faint">Editing · {VIEW_LABEL[view]} view</div>
          <h2 className="text-sm font-semibold truncate">{nameOf(view, path, content)}</h2>
        </div>
        <button type="button" onClick={onClose} className="p-1 text-text-muted hover:text-text" aria-label="Close" title="Close (Esc)">
          <X className="size-4" />
        </button>
      </div>
      <div className="px-4 py-3 space-y-3 max-h-[calc(100vh-16rem)] overflow-y-auto">{body}</div>
      {list && listItems ? (
        <div className="flex flex-wrap items-center gap-1.5 px-4 py-3 border-t bg-surface-2 rounded-b-md">
          {fixedList ? <span className="w-full text-[12px] text-text-muted">Move this entry up or down the record:</span> : null}
          <Button size="sm" icon={<ArrowUp className="size-3.5" />} disabled={index <= 0} onClick={() => onMove(-1)} title="Move before the previous item">
            Earlier
          </Button>
          <Button
            size="sm"
            icon={<ArrowDown className="size-3.5" />}
            disabled={index < 0 || index >= listItems.length - 1}
            onClick={() => onMove(1)}
            title="Move after the next item"
          >
            Later
          </Button>
          {fixedList ? null : (
            <>
              <Button size="sm" icon={<Plus className="size-3.5" />} onClick={onAddAfter}>
                Add after
              </Button>
              <Button size="sm" icon={<Copy className="size-3.5" />} onClick={onDuplicate}>
                Duplicate
              </Button>
              <Button size="sm" variant="danger" icon={<Trash2 className="size-3.5" />} onClick={onRemove} className="ml-auto">
                Delete
              </Button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** One entry of the verification record: its number, its words, its layout, and Country's fixed value. */
function RowFields({ row, set }: { row: RecordRow; set: (f: string, v: unknown) => void }) {
  return (
    <>
      <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2">
        <Field label="Number" hint="Empty: none.">
          <Input value={row.number} maxLength={12} onChange={(e) => set("number", e.target.value)} />
        </Field>
        <Field label="Words">
          <Input value={row.text} onChange={(e) => set("text", e.target.value)} />
        </Field>
      </div>
      {row.id === "country" ? (
        <Field label="Value" hint="Fixed text, the same on every document's page.">
          <Input value={row.value} onChange={(e) => set("value", e.target.value)} />
        </Field>
      ) : null}
      {row.id === "issue_date" ? (
        <Field label="Date format" hint="How the document's date is written in this entry. The banner and the sticker keep their own.">
          <Select value={row.format} onChange={(e) => set("format", e.target.value as DateFormat)}>
            {DATE_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      {row.id !== "officer" ? (
        <Field label="Layout">
          <Select value={row.layout} onChange={(e) => set("layout", e.target.value as RowLayout)}>
            {ROW_LAYOUTS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <AlignField value={row.align} onChange={(a) => set("align", a)} />
      <PartMoves row={row} set={set} />
      <VisibleToggle hidden={row.hidden} onChange={(h) => set("hidden", h)} />
      <Alert tone="info">
        The value {row.id === "country" ? "is" : "shown is"} {ROW_SOURCE[row.id]}.{" "}
        {row.id === "country" ? null : "It changes with every document and is not edited here."} These words are the
        page&apos;s own; the sticker has its own, set under Appo → Background image.
      </Alert>
    </>
  );
}

/** Where an entry's text sits across its box. */
function AlignField({ value, onChange }: { value: RowAlign; onChange: (a: RowAlign) => void }) {
  return (
    <Field label="Text across the box">
      <div className="inline-flex rounded-md border overflow-hidden">
        {ROW_ALIGNS.map((a) => (
          <button
            key={a.value}
            type="button"
            onClick={() => onChange(a.value)}
            className={cx("px-3 h-8 text-[13px] border-r last:border-r-0", value === a.value ? "bg-teal-600 text-white" : "bg-surface hover:bg-surface-2")}
            aria-pressed={value === a.value}
          >
            {a.label}
          </button>
        ))}
      </div>
    </Field>
  );
}

/** What each set of text in a box is called here. */
function partName(row: RecordRow, part: RowPart): string {
  if (part === "number") return "Number";
  if (part === "words") return row.id === "certificate" ? "Text" : "Words";
  if (part === "value") return row.id === "officer" ? "Officer's name" : "Value";
  return part === "designation" ? "Designation" : "Signature";
}

/**
 * Moves each set of text of an entry within its box, by design pixels: typed in, nudged with the
 * arrows (Shift: 10 at a time), or dragged on the page itself while the entry is open here.
 */
function PartMoves({ row, set }: { row: RecordRow; set: (f: string, v: unknown) => void }) {
  const parts = rowParts(row);
  const at = (part: RowPart): PartMove => row.moves[part] ?? { x: 0, y: 0 };
  const put = (part: RowPart, m: PartMove) => {
    const clamp = (n: number) => Math.round(Math.min(MAX_MOVE, Math.max(-MAX_MOVE, n)) * 10) / 10;
    const next = { ...row.moves };
    const c = { x: clamp(m.x), y: clamp(m.y) };
    if (c.x === 0 && c.y === 0) delete next[part];
    else next[part] = c;
    set("moves", next);
  };
  const anyMoved = parts.some((part) => row.moves[part]);
  return (
    <div className="rounded-md border bg-surface-2 p-2.5 space-y-2">
      <div>
        <div className="text-[13px] font-medium">Position of the text in the box</div>
        <p className="text-[12px] text-text-muted mt-0.5">
          Drag the dashed text on the page, or move it here (design pixels; Shift + arrow moves 10). The rest of the
          box stays where it is.
        </p>
      </div>
      {parts.map((part) => {
        const m = at(part);
        const nudge = (dx: number, dy: number) => (e: React.MouseEvent) => {
          const step = e.shiftKey ? 10 : 1;
          put(part, { x: m.x + dx * step, y: m.y + dy * step });
        };
        return (
          <div key={part} className="flex flex-wrap items-center gap-1.5">
            <span className="w-24 text-[12.5px] font-medium truncate">{partName(row, part)}</span>
            <label className="inline-flex items-center gap-1 text-[12px] text-text-muted">
              X
              <Input
                type="number"
                step={1}
                value={m.x}
                className="w-16 h-7 py-0 text-[12.5px]"
                onChange={(e) => e.target.value !== "" && put(part, { ...m, x: Number(e.target.value) })}
              />
            </label>
            <label className="inline-flex items-center gap-1 text-[12px] text-text-muted">
              Y
              <Input
                type="number"
                step={1}
                value={m.y}
                className="w-16 h-7 py-0 text-[12.5px]"
                onChange={(e) => e.target.value !== "" && put(part, { ...m, y: Number(e.target.value) })}
              />
            </label>
            <span className="inline-flex">
              <button type="button" className="px-1.5 h-7 border rounded-l-md hover:bg-surface" title="Left" onClick={nudge(-1, 0)}>
                ←
              </button>
              <button type="button" className="px-1.5 h-7 border-y hover:bg-surface" title="Up" onClick={nudge(0, -1)}>
                ↑
              </button>
              <button type="button" className="px-1.5 h-7 border-y border-l hover:bg-surface" title="Down" onClick={nudge(0, 1)}>
                ↓
              </button>
              <button type="button" className="px-1.5 h-7 border rounded-r-md hover:bg-surface" title="Right" onClick={nudge(1, 0)}>
                →
              </button>
            </span>
            {row.moves[part] ? (
              <button type="button" className="text-[12px] text-teal-700 hover:underline" onClick={() => put(part, { x: 0, y: 0 })}>
                Put back
              </button>
            ) : null}
          </div>
        );
      })}
      {anyMoved ? (
        <Button size="sm" icon={<RotateCcw className="size-3.5" />} onClick={() => set("moves", {})}>
          Put all text back
        </Button>
      ) : null}
    </div>
  );
}

/** A colour picker with its hex value beside it. */
function ColorField({
  label,
  value,
  onChange,
  allowNone,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** Offer "none" (an empty value), as for the border. */
  allowNone?: boolean;
}) {
  const none = allowNone && !value;
  // What is typed shows as it is typed; only a whole #rrggbb (or nothing, where allowed) is taken.
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <Field label={label}>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={value || "#000000"}
          disabled={none}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 shrink-0 cursor-pointer rounded border bg-surface p-0.5 disabled:opacity-40"
          aria-label={label}
        />
        <Input
          value={draft}
          placeholder={allowNone ? "none" : "#000000"}
          className="font-mono"
          onChange={(e) => {
            setDraft(e.target.value);
            const v = e.target.value.trim();
            if (v === "" && allowNone) onChange("");
            else if (/^#[0-9a-f]{6}$/i.test(v)) onChange(v.toLowerCase());
          }}
          onBlur={() => setDraft(value)}
        />
        {allowNone ? (
          <Checkbox label="None" checked={none} onChange={(e) => onChange(e.target.checked ? "" : "#bdccbc")} />
        ) : null}
      </div>
    </Field>
  );
}

/** A number in design pixels (or %, em), kept within its range. */
function NumberField({
  label,
  value,
  min,
  max,
  step,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  hint?: string;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
      />
    </Field>
  );
}

/** The certificate box: its text and how it looks, set apart for each view. */
function CertificateFields({
  view,
  row,
  style,
  set,
  setStyle,
  onResetStyle,
}: {
  view: PageView;
  row: RecordRow;
  style: CertificateStyle;
  set: (f: string, v: unknown) => void;
  setStyle: (field: keyof CertificateStyle, v: unknown) => void;
  onResetStyle: () => void;
}) {
  const grid = view === "mobile" ? "360 px phone grid" : "1062 px page grid";
  return (
    <>
      <Field label="Text in the box" hint="Shown on the page only, never on the sticker.">
        <Input value={row.text} onChange={(e) => set("text", e.target.value)} />
      </Field>
      <Field label="Font">
        <Select value={style.font} onChange={(e) => setStyle("font", e.target.value as CertificateFont)}>
          {CERTIFICATE_FONTS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        <Checkbox label="Bold" checked={style.bold} onChange={(e) => setStyle("bold", e.target.checked)} />
        <Checkbox label="Italic" checked={style.italic} onChange={(e) => setStyle("italic", e.target.checked)} />
        <Checkbox label="CAPITAL LETTERS" checked={style.uppercase} onChange={(e) => setStyle("uppercase", e.target.checked)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Text size" value={style.size} min={6} max={60} step={0.5} hint={`On the ${grid}`} onChange={(v) => setStyle("size", v)} />
        <NumberField label="Letter spacing (em)" value={style.spacing} min={0} max={1} step={0.01} onChange={(v) => setStyle("spacing", v)} />
        <NumberField
          label="Width (%)"
          value={style.width}
          min={20}
          max={100}
          step={1}
          hint={view === "mobile" ? "Of the record's width on phones" : "Of the record's width"}
          onChange={(v) => setStyle("width", v)}
        />
        <NumberField label="Height" value={style.height} min={0} max={200} step={1} hint={`At least, on the ${grid}`} onChange={(v) => setStyle("height", v)} />
        <NumberField label="Rounded corners" value={style.radius} min={0} max={40} step={0.5} onChange={(v) => setStyle("radius", v)} />
      </div>
      <div className="grid grid-cols-1 gap-2">
        <ColorField label="Text colour" value={style.color} onChange={(v) => setStyle("color", v)} />
        <ColorField label="Background colour" value={style.background} onChange={(v) => setStyle("background", v)} />
        <ColorField label="Border colour" value={style.border} allowNone onChange={(v) => setStyle("border", v)} />
        {style.border ? (
          <Field label="Border">
            <Select value={style.border_sides} onChange={(e) => setStyle("border_sides", e.target.value as CertificateBorderSides)}>
              {CERTIFICATE_BORDER_SIDES.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>
      <AlignField value={row.align} onChange={(a) => set("align", a)} />
      <PartMoves row={row} set={set} />
      <VisibleToggle hidden={row.hidden} onChange={(h) => set("hidden", h)} />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" icon={<RotateCcw className="size-3.5" />} onClick={onResetStyle}>
          Back to the first look
        </Button>
      </div>
      <p className="text-[12.5px] text-text-muted">
        Desktop and mobile each keep their own look, so the box can be narrower on phones. Saved in the database with the
        rest of the page.
      </p>
    </>
  );
}

function VisibleToggle({ hidden, onChange }: { hidden: boolean; onChange: (hidden: boolean) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" icon={hidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />} onClick={() => onChange(!hidden)}>
        {hidden ? "Show on the page" : "Hide from the page"}
      </Button>
      {hidden ? <Badge tone="warn">Hidden</Badge> : null}
    </div>
  );
}

function TextFields({ value, set, multiline }: { value: PText; set: (f: string, v: unknown) => void; multiline: boolean }) {
  return (
    <>
      <Field label="Text" hint={multiline ? "Press Enter for a new line." : undefined}>
        {multiline ? (
          <Textarea rows={4} value={value.text} onChange={(e) => set("text", e.target.value)} />
        ) : (
          <Input value={value.text} onChange={(e) => set("text", e.target.value)} />
        )}
      </Field>
      <VisibleToggle hidden={value.hidden} onChange={(h) => set("hidden", h)} />
    </>
  );
}

function HrefField({
  value,
  onChange,
  allowEmpty,
  emptyHint,
}: {
  value: string;
  onChange: (v: string) => void;
  allowEmpty?: boolean;
  emptyHint?: string;
}) {
  const trimmed = value.trim();
  const bad = trimmed && safeHref(trimmed, "\u0000") === "\u0000";
  const full = trimmed && !bad ? safeHref(trimmed) : "";
  return (
    <Field
      label="Link"
      error={bad ? "Use a web address (https://…), mailto:, tel:, or a path on this site starting with /" : null}
      hint={
        !trimmed && allowEmpty
          ? emptyHint
          : trimmed === "#"
            ? "“#” goes nowhere. Put the real address here."
            : full && full !== trimmed
              ? `Saved as ${full}`
              : "A web address (https://…), an email (mailto:…), a phone (tel:…), or a path on this site (/…)."
      }
    >
      <div className="flex gap-1.5">
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={allowEmpty ? "(automatic)" : "https://"} invalid={Boolean(bad)} />
        {full && full !== "#" && /^https?:\/\//i.test(full) ? (
          <a href={full} target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-2 rounded-md border text-text-muted hover:text-text" title="Open this link">
            <ExternalLink className="size-4" />
          </a>
        ) : null}
      </div>
    </Field>
  );
}

function LinkTextFields({ value, set }: { value: PLinkText; set: (f: string, v: unknown) => void }) {
  return (
    <>
      <Field label="Text">
        <Input value={value.text} onChange={(e) => set("text", e.target.value)} />
      </Field>
      <HrefField value={value.href} onChange={(v) => set("href", v)} allowEmpty emptyHint="Empty or # shows plain text instead of a link." />
      <Checkbox label="Open in a new tab" checked={value.new_tab} onChange={(e) => set("new_tab", e.target.checked)} />
      <VisibleToggle hidden={value.hidden} onChange={(h) => set("hidden", h)} />
    </>
  );
}

function LinkFields({
  path,
  value,
  set,
  multiline,
  grid,
  showIcon,
}: {
  path: string;
  value: PLink;
  set: (f: string, v: unknown) => void;
  multiline: boolean;
  /** The design grid the width is measured on; null hides the width. */
  grid: number | null;
  showIcon: boolean;
}) {
  const isOpen = path === "document.open";
  return (
    <>
      <Field label="Button / link name" hint={multiline ? "Press Enter to split the name over two lines, as in “Verify Document”." : undefined}>
        {multiline ? (
          <Textarea rows={2} value={value.text} onChange={(e) => set("text", e.target.value)} />
        ) : (
          <Input value={value.text} onChange={(e) => set("text", e.target.value)} />
        )}
      </Field>
      <HrefField
        value={value.href}
        onChange={(v) => set("href", v)}
        allowEmpty={isOpen}
        emptyHint="Empty opens the document's own PDF in a new tab — the right choice for almost every page."
      />
      <Checkbox label="Open in a new tab" checked={value.new_tab} onChange={(e) => set("new_tab", e.target.checked)} />
      {showIcon ? (
        <Field label="Icon after the name">
          <Select value={value.icon} onChange={(e) => set("icon", e.target.value as LinkIcon)}>
            {LINK_ICONS.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      {grid ? (
        <Field
          label="Width (design pixels)"
          hint={
            grid === 360
              ? "The phone layout is drawn on a 360 px wide grid and scales to each phone. Leave empty to fit the name; the links of a row wrap onto a second line like the design."
              : "The page is laid out on a 1062 px wide grid and scales to the window. Leave empty to fit the name."
          }
        >
          <Input
            type="number"
            min={0}
            max={grid}
            step={0.1}
            value={value.width ?? ""}
            onChange={(e) => set("width", e.target.value === "" ? null : Math.min(grid, Math.max(0, Number(e.target.value))))}
          />
        </Field>
      ) : null}
      <VisibleToggle hidden={value.hidden} onChange={(h) => set("hidden", h)} />
    </>
  );
}

function SocialFields({ value, set }: { value: PSocial; set: (f: string, v: unknown) => void }) {
  return (
    <>
      <Field label="Icon">
        <Select value={value.icon} onChange={(e) => set("icon", e.target.value as SocialIcon)}>
          {SOCIAL_ICONS.map((i) => (
            <option key={i.value} value={i.value}>
              {i.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Name" hint="Read out by screen readers and shown when the pointer rests on the icon.">
        <Input value={value.label} onChange={(e) => set("label", e.target.value)} />
      </Field>
      <HrefField value={value.href} onChange={(v) => set("href", v)} />
      <Checkbox label="Open in a new tab" checked={value.new_tab} onChange={(e) => set("new_tab", e.target.checked)} />
      <VisibleToggle hidden={value.hidden} onChange={(h) => set("hidden", h)} />
    </>
  );
}

/**
 * The icon of the tab a document's PDF opens in on a computer. That tab's title is the document's
 * 40-character name, as in the sample here.
 */
function PdfFaviconField({
  content,
  assets,
  onChange,
  onUploaded,
}: {
  content: DesktopContent;
  assets: Record<string, string>;
  onChange: (path: string, value: unknown) => void;
  onUploaded: (key: string, url: string) => void;
}) {
  const page = content.meta.favicon;
  return (
    <FaviconField
      label="Favicon of the PDF tab"
      value={content.meta.pdf_favicon}
      title={SAMPLE_PDF_NAME.replace(/\.pdf$/, "")}
      fallback={{
        url: (page.key && assets[page.key]) || "/icon.svg",
        text: page.key
          ? "No favicon of its own, so the PDF tab shows the page's favicon."
          : "No favicon of its own, so the PDF tab shows the app's icon.",
      }}
      resetLabel="Use the page's favicon"
      assets={assets}
      onChange={(v) => onChange("meta.pdf_favicon", v)}
      onUploaded={onUploaded}
    />
  );
}

/**
 * A browser-tab icon — the verification page's, or the PDF tab's — shown on a tab as visitors see it,
 * next to that tab's title.
 */
function FaviconField({
  label = "Favicon",
  value,
  title,
  fallback = { url: "/icon.svg", text: "No favicon uploaded, so the app's own icon shows." },
  resetLabel = "Use the app's icon",
  assets,
  onChange,
  onUploaded,
}: {
  label?: string;
  value: PFavicon;
  title: string;
  /** What the tab shows without an upload. */
  fallback?: { url: string; text: string };
  resetLabel?: string;
  assets: Record<string, string>;
  onChange: (value: PFavicon) => void;
  onUploaded: (key: string, url: string) => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const url = value.key ? assets[value.key] : null;

  /** The image as chosen, when the squares painted behind it were taken out before uploading. */
  const [original, setOriginal] = useState<{ key: string; file: File } | null>(null);

  async function upload(file: File, asIs = false) {
    setBusy(true);
    setProgress(0);
    try {
      const sent = asIs ? { file, cleared: false } : await withoutFakeTransparency(file, MAX_FAVICON_BYTES);
      const form = new FormData();
      form.append("file", sent.file);
      form.append("kind", "favicon");
      const r = await postFormWithProgress<{ key: string; url: string; content_type: string; filename: string }>(
        "/api/admin/appo/page/asset",
        form,
        setProgress,
      );
      onUploaded(r.key, r.url);
      onChange({ key: r.key, content_type: r.content_type, filename: r.filename });
      setOriginal(sent.cleared ? { key: r.key, file } : null);
      toast(
        sent.cleared
          ? "Favicon uploaded. The grey and white squares painted behind it were made see-through. Save the page to put it live."
          : "Favicon uploaded. Save the page to put it live.",
      );
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <div className="text-[13px] font-medium mb-1.5">{label}</div>
      <div className="rounded-md border bg-surface-2 px-2 pt-2" aria-label={`${label}: browser tab preview`}>
        <div className="flex items-center gap-2 w-64 max-w-full h-8 px-2.5 rounded-t-md border border-b-0 bg-surface" title={title}>
          {/* A signed R2 link, or what shows when none is uploaded. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url ?? fallback.url} alt="" className="size-4 shrink-0 object-contain" />
          <span className="min-w-0 flex-1 truncate text-[12px]">{title || "Untitled"}</span>
          <X className="size-3 shrink-0 text-text-faint" />
        </div>
      </div>
      <p className="text-[12px] text-text-muted mt-1">
        {value.key ? `In use after saving: ${value.filename || "uploaded image"}` : fallback.text}
      </p>
      <div className="flex flex-wrap gap-1.5 mt-2">
        <input
          ref={input}
          type="file"
          accept="image/x-icon,image/vnd.microsoft.icon,.ico,image/png,image/svg+xml,.svg,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
        <Button size="sm" variant="primary" icon={<ImageUp className="size-3.5" />} loading={busy} onClick={() => input.current?.click()}>
          {busy ? `Uploading ${Math.round(progress * 100)}%` : value.key ? "Replace favicon" : "Upload favicon"}
        </Button>
        {value.key ? (
          <Button size="sm" onClick={() => onChange({ key: null, content_type: null, filename: null })}>
            {resetLabel}
          </Button>
        ) : null}
      </div>
      {original && original.key === value.key ? (
        <SquaresNote what="favicon" busy={busy} onAsIs={() => void upload(original.file, true)} />
      ) : null}
      <p className="text-[12.5px] text-text-muted mt-1.5">
        A square image: ICO or PNG (at least 48 × 48, best 512 × 512) shows in every browser; SVG in most, but not
        Safari. Up to 1 MB, stored in R2. Visitors see it after the page is saved.
      </p>
    </div>
  );
}

/** The most a logo and a favicon may be; the same limits as the upload route's. */
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const MAX_FAVICON_BYTES = 1024 * 1024;

/** Says the painted squares were taken out of the image, with a way to upload it as it was. */
function SquaresNote({ what, busy, onAsIs }: { what: string; busy: boolean; onAsIs: () => void }) {
  return (
    <div className="rounded-md border border-dashed px-2.5 py-2 text-[12.5px] text-text-muted">
      This {what} had grey and white squares painted behind it (a picture that only looks transparent). They were
      made see-through before uploading, so they do not show on the page.{" "}
      <button type="button" className="underline hover:text-text disabled:opacity-50" disabled={busy} onClick={onAsIs}>
        Upload it as it was
      </button>
    </div>
  );
}

function ImageFields({
  path,
  value,
  assets,
  set,
  onChange,
  onUploaded,
}: {
  path: string;
  value: PImage;
  assets: Record<string, string>;
  set: (f: string, v: unknown) => void;
  onChange: (path: string, value: unknown) => void;
  onUploaded: (key: string, url: string) => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const url = value.key ? assets[value.key] : null;
  const white = path === "footer.logo";
  /** The image as chosen, when the squares painted behind it were taken out before uploading. */
  const [original, setOriginal] = useState<{ key: string; file: File } | null>(null);

  async function upload(file: File, asIs = false) {
    setBusy(true);
    setProgress(0);
    try {
      // Grey and white squares painted into a "transparent" logo would show behind it on the page.
      const sent = asIs ? { file, cleared: false } : await withoutFakeTransparency(file, MAX_LOGO_BYTES);
      const form = new FormData();
      form.append("file", sent.file);
      const r = await postFormWithProgress<{ key: string; url: string; content_type: string; filename: string }>(
        "/api/admin/appo/page/asset",
        form,
        setProgress,
      );
      onUploaded(r.key, r.url);
      onChange(path, { ...value, key: r.key, content_type: r.content_type, filename: r.filename });
      setOriginal(sent.cleared ? { key: r.key, file } : null);
      toast(
        sent.cleared
          ? "Logo uploaded. The grey and white squares painted behind it were made see-through. Save the page to put it live."
          : "Logo uploaded. Save the page to put it live.",
      );
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <>
      <div className={cx("flex items-center justify-center rounded-md border p-3 h-28", white ? "bg-[#003d1c]" : "bg-surface-2")}>
        {url ? (
          // A signed R2 link; next/image would need the R2 host configured.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={value.alt} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className={cx("text-[12.5px]", white ? "text-white/80" : "text-text-muted")}>Built-in emblem (no logo uploaded)</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.svg"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
        <Button size="sm" variant="primary" icon={<ImageUp className="size-3.5" />} loading={busy} onClick={() => input.current?.click()}>
          {busy ? `Uploading ${Math.round(progress * 100)}%` : value.key ? "Replace logo" : "Upload logo"}
        </Button>
        {value.key ? (
          <Button size="sm" onClick={() => onChange(path, { ...value, key: null, content_type: null, filename: null })}>
            Use the built-in emblem
          </Button>
        ) : null}
      </div>
      {original && original.key === value.key ? (
        <SquaresNote what="logo" busy={busy} onAsIs={() => void upload(original.file, true)} />
      ) : null}
      <p className="text-[12.5px] text-text-muted">
        PNG, JPG, WebP, GIF or SVG up to 2 MB, stored in R2. A square logo fits best; it is scaled to the space in the
        design. Grey and white squares painted behind a &quot;transparent&quot; logo are made see-through as it uploads.{" "}
        {white ? "This one sits on the dark green footer, so a white or light logo reads best." : null}
      </p>
      <Field label="Description" hint="Read out by screen readers in place of the logo.">
        <Input value={value.alt} onChange={(e) => set("alt", e.target.value)} />
      </Field>
      <HrefField value={value.href} onChange={(v) => set("href", v)} allowEmpty emptyHint="Empty or # makes the logo plain, not a link." />
      <Checkbox label="Open in a new tab" checked={value.new_tab} onChange={(e) => set("new_tab", e.target.checked)} />
      <VisibleToggle hidden={value.hidden} onChange={(h) => set("hidden", h)} />
    </>
  );
}

function ViewerFields({ content, onChange }: { content: DesktopContent; onChange: (path: string, value: unknown) => void }) {
  const v = content.document.viewer;
  return (
    <>
      <p className="text-[12.5px] text-text-muted">
        The PDF of each document is shown here. Visitors can page through it, zoom, rotate, add notes and drawings of
        their own (kept only in their browser), print it, download it, or save a copy with their notes.
      </p>
      <Checkbox
        label="Start with page thumbnails open"
        checked={v.sidebar_open}
        onChange={(e) => onChange("document.viewer.sidebar_open", e.target.checked)}
      />
      <div>
        <div className="text-[13px] font-medium mb-1.5">Toolbar buttons</div>
        <div className="space-y-1.5">
          {VIEWER_TOOLS.map((t) => (
            <Checkbox
              key={t.key}
              label={t.label}
              checked={v.tools[t.key as ViewerTool]}
              onChange={(e) => onChange(`document.viewer.tools.${t.key}`, e.target.checked)}
            />
          ))}
        </div>
        <p className="text-[12.5px] text-text-muted mt-2">
          The triangle-and-plus button saves a copy of the PDF with the visitor&apos;s notes and drawings written into it.
        </p>
      </div>
    </>
  );
}

/* ---------------- Mobile-only pieces ---------------- */

function MobileViewerFields({
  content,
  onChange,
  onPick,
}: {
  content: MobileContent;
  onChange: (path: string, value: unknown) => void;
  onPick: (path: string) => void;
}) {
  const v = content.document.viewer;
  return (
    <>
      <Field label="What phones show here">
        <Select value={v.mode} onChange={(e) => onChange("document.viewer.mode", e.target.value as MobileViewerMode)}>
          {MOBILE_VIEWER_MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      </Field>
      <p className="text-[12.5px] text-text-muted">
        {v.mode === "card"
          ? "As in the mobile design: the PDF icon, the file's name and a button that opens the PDF in the phone's own viewer, where it can be zoomed, saved and shared."
          : "Every page of the PDF is drawn at the phone's width, one under the other, with an “Open the PDF” link below them. Pages load as the visitor scrolls to them. If the PDF cannot be drawn, the file card shows instead."}
      </p>
      {v.mode === "card" ? (
        <div className="space-y-1.5">
          <Button size="sm" onClick={() => onPick("document.viewer.filename")}>
            File name: {v.filename.hidden ? "hidden" : "shown"} — change
          </Button>{" "}
          <Button size="sm" onClick={() => onPick("document.viewer.button")}>
            Button: “{content.document.viewer.button.text}” — change
          </Button>
        </div>
      ) : null}
    </>
  );
}

function MenuButtonFields({
  value,
  set,
  menuOpen,
  onMenuOpen,
}: {
  value: PText;
  set: (f: string, v: unknown) => void;
  menuOpen: boolean;
  onMenuOpen: (open: boolean) => void;
}) {
  return (
    <>
      <p className="text-[12.5px] text-text-muted">
        On phones the main menu, the quick links and the social icons sit behind this button. A tap opens them under the
        header; a tap on a link, outside the menu, or on the button again closes it.
      </p>
      <Checkbox label="Show the menu open in this preview" checked={menuOpen} onChange={(e) => onMenuOpen(e.target.checked)} />
      <Field label="Button name" hint="Not printed on the button (it shows ☰); screen readers read it out, e.g. “Menu”.">
        <Input value={value.text} onChange={(e) => set("text", e.target.value)} />
      </Field>
      <VisibleToggle hidden={value.hidden} onChange={(h) => set("hidden", h)} />
      {value.hidden ? <Alert tone="warn">With the button hidden, phones show no menu at all.</Alert> : null}
    </>
  );
}
