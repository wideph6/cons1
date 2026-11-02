"use client";

import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  ImageUp,
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
import { VerifyPage } from "@/components/new-m-page/VerifyPage";
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
import {
  cleanDesktop,
  cleanMobile,
  DEFAULT_DESKTOP,
  DEFAULT_MOBILE,
  LINK_ICONS,
  RECORD_FIELDS,
  SAMPLE_RECORD,
  SOCIAL_ICONS,
  VIEWER_TOOLS,
  getAt,
  listOf,
  newId,
  safeHref,
  setAt,
  type DesktopContent,
  type LinkIcon,
  type MobileContent,
  type PageRecord,
  type PageView,
  type PImage,
  type PLink,
  type PLinkText,
  type PSocial,
  type PText,
  type RecordField,
  type SocialIcon,
  type ViewerTool,
} from "@/lib/new-m-page";
import type { NewMRecord, Paged } from "@/lib/types";
import { formatDateTime, formatIssued } from "@/lib/utils";

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
  "record.labels.attestation_number": "Label — attestation number",
  "record.labels.issue_date": "Label — date of issue",
  "record.labels.document_type": "Label — document type",
  "record.labels.issuing_office": "Label — issuing office",
  "record.labels.issuing_authority": "Label — issuing authority",
  "record.labels.officer": "Label — approving officer",
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

/** Which document value appears under each label. */
const FIELD_SOURCE: Record<RecordField, string> = {
  attestation_number: "the document's attestation number",
  issue_date: "the document's issue date",
  document_type: "the document type picked when the document was uploaded",
  issuing_office: "the issuing office picked when the document was uploaded",
  issuing_authority: "the issuing authority picked when the document was uploaded",
  officer: "the approving officer's name (with designation and signature) picked when the document was uploaded",
};

/** Text that may run over several lines (Enter makes a line break on the page). */
const MULTILINE = new Set(["hero.lead", "record.disclaimer", "result.missing_text"]);
const LINEBREAK_LISTS = new Set(["nav.items", "header.top_links"]);

function nameOf(path: string, content: DesktopContent): string {
  if (NAMES[path]) return NAMES[path];
  const list = listOf(content, path);
  if (list && NAMES[list.listPath]) return NAMES[list.listPath];
  return path;
}

/** The outline beside the preview: every piece of the page, hidden ones included. */
function outline(c: DesktopContent): Array<{ title: string; items: Array<{ path: string; label: string; hidden: boolean }>; add?: string[] }> {
  const t = (path: string) => {
    const v = getAt(c, path) as { hidden?: boolean; text?: string } | undefined;
    return { path, label: NAMES[path] ?? path, hidden: Boolean(v?.hidden) };
  };
  const list = (listPath: string, items: Array<{ id: string; hidden: boolean; text?: string; label?: string }>) =>
    items.map((i) => ({
      path: `${listPath}.${i.id}`,
      label: `${NAMES[listPath] ?? listPath}: ${(i.text ?? i.label ?? "").replace(/\n/g, " ") || "(empty)"}`,
      hidden: i.hidden,
    }));
  return [
    {
      title: "Header",
      items: [
        t("header.logo"),
        t("header.title"),
        t("header.subtitle"),
        ...list("header.top_links", c.header.top_links),
        t("header.connect"),
        ...list("header.social", c.header.social),
      ],
      add: ["header.top_links", "header.social"],
    },
    { title: "Main menu", items: list("nav.items", c.nav.items), add: ["nav.items"] },
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
      items: [
        t("result.found_title"),
        t("result.document_label"),
        t("result.issued_label"),
        t("result.missing_title"),
        t("result.missing_text"),
      ],
    },
    {
      title: "Verification record",
      items: [
        t("record.eyebrow"),
        t("record.title"),
        t("record.logo"),
        t("record.cert_title"),
        t("record.cert_subtitle"),
        ...RECORD_FIELDS.map((f) => t(`record.labels.${f}`)),
        t("record.designation"),
        t("record.signature"),
        t("record.disclaimer"),
      ],
    },
    {
      title: "Supporting document",
      items: [t("document.eyebrow"), t("document.title"), t("document.open"), { path: "document.viewer", label: NAMES["document.viewer"], hidden: false }],
    },
    {
      title: "Bottom of the page",
      items: [t("cta.button"), t("cta.help_before"), t("cta.email"), t("cta.help_after")],
    },
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
      add: ["footer.left_links", "footer.rows.0", "footer.rows.1", "footer.rows.2"],
    },
  ];
}

/** A new item for a list, made like the list's own items. */
function blankItem(listPath: string, like?: PLink | PSocial): PLink | PSocial {
  if (listPath === "header.social") {
    const s = like as PSocial | undefined;
    return { id: newId("social"), icon: s?.icon ?? "website", label: "Website", href: "#", new_tab: true, hidden: false };
  }
  const prefix = listPath.replace(/[^a-z0-9]+/gi, "-");
  return {
    id: newId(prefix),
    text: "New link",
    href: "#",
    new_tab: false,
    hidden: false,
    icon: "none",
    width: null,
  };
}

/* ---------------- The editor ---------------- */

interface LoadResult {
  desktop: { content: DesktopContent; updated_at: string | null };
  mobile: { content: MobileContent; updated_at: string | null };
  defaults: { desktop: DesktopContent; mobile: MobileContent };
  assets: Record<string, string>;
  table_ready: boolean;
}

export function NewMPageEditor() {
  const { toast } = useToast();
  const [view, setView] = useState<PageView>("desktop");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tableReady, setTableReady] = useState(true);

  const [saved, setSaved] = useState<DesktopContent | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [content, setContent] = useState<DesktopContent | null>(null);
  const [past, setPast] = useState<DesktopContent[]>([]);
  const [future, setFuture] = useState<DesktopContent[]>([]);
  const [assets, setAssets] = useState<Record<string, string>>({});

  const [mobileSaved, setMobileSaved] = useState<MobileContent>(DEFAULT_MOBILE);
  const [mobileAt, setMobileAt] = useState<string | null>(null);
  const [mobile, setMobile] = useState<MobileContent>(DEFAULT_MOBILE);

  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<null | "reset" | "discard">(null);

  const [record, setRecord] = useState<PageRecord>(SAMPLE_RECORD);
  const [recordLabel, setRecordLabel] = useState("Sample values from the design");
  const [showMissing, setShowMissing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const previewRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<LoadResult>("/api/admin/new-m/page");
      // Read through the same checks as the server, so anything missing shows the design's default.
      const desktop = cleanDesktop(r.desktop.content);
      const mobileContent = cleanMobile(r.mobile.content);
      setSaved(desktop);
      setContent(desktop);
      setSavedAt(r.desktop.updated_at);
      setMobileSaved(mobileContent);
      setMobile(mobileContent);
      setMobileAt(r.mobile.updated_at);
      setAssets(r.assets);
      setTableReady(r.table_ready);
      setPast([]);
      setFuture([]);
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
        const page = await api<Paged<NewMRecord>>(`/api/admin/new-m${qs({ limit: 1 })}`);
        const first = page.items[0];
        if (first) await pickRecord(first);
      } catch {
        // The sample values stay.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pickRecord(r: NewMRecord | null) {
    setPickerOpen(false);
    if (!r) {
      setRecord(SAMPLE_RECORD);
      setRecordLabel("Sample values from the design");
      return;
    }
    try {
      const res = await api<{ record: PageRecord }>(`/api/admin/new-m/page/record${qs({ id: r.id })}`);
      setRecord(res.record);
      setRecordLabel(`${r.attestation_number} · ${formatIssued(r.issue_date)}`);
    } catch (e) {
      toast(errorMessage(e), "danger");
    }
  }

  const dirty = useMemo(
    () =>
      (content && saved && JSON.stringify(content) !== JSON.stringify(saved)) ||
      JSON.stringify(mobile) !== JSON.stringify(mobileSaved),
    [content, saved, mobile, mobileSaved],
  );

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /** Every change goes through here, so it can be undone. */
  const change = useCallback(
    (next: DesktopContent) => {
      setContent((cur) => {
        if (cur) setPast((p) => [...p.slice(-99), cur]);
        return next;
      });
      setFuture([]);
    },
    [],
  );

  const update = useCallback(
    (path: string, value: unknown) => {
      if (!content) return;
      change(setAt(content, path, value));
    },
    [content, change],
  );

  function undo() {
    if (!past.length || !content) return;
    setFuture((f) => [content, ...f]);
    setContent(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
  }

  function redo() {
    if (!future.length || !content) return;
    setPast((p) => [...p, content]);
    setContent(future[0]);
    setFuture((f) => f.slice(1));
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ---------- Lists ---------- */

  function addTo(listPath: string, after?: string) {
    if (!content) return;
    const list = (getAt(content, listPath) as Array<PLink | PSocial>) ?? [];
    const at = after ? list.findIndex((x) => x.id === after) : -1;
    const like = at >= 0 ? list[at] : list[list.length - 1];
    const item = blankItem(listPath, like);
    if (like && "text" in like && "text" in item) {
      // A new item looks like its neighbours: same icon-less style and an automatic width.
      item.new_tab = like.new_tab;
    }
    const next = list.slice();
    next.splice(at >= 0 ? at + 1 : next.length, 0, item);
    change(setAt(content, listPath, next));
    setSelected(`${listPath}.${item.id}`);
  }

  function duplicate(path: string) {
    if (!content) return;
    const l = listOf(content, path);
    if (!l) return;
    const list = getAt(content, l.listPath) as Array<PLink | PSocial>;
    const i = list.findIndex((x) => x.id === l.itemId);
    const copy = { ...list[i], id: newId(l.listPath.replace(/[^a-z0-9]+/gi, "-")) };
    const next = list.slice();
    next.splice(i + 1, 0, copy);
    change(setAt(content, l.listPath, next));
    setSelected(`${l.listPath}.${copy.id}`);
  }

  function move(path: string, dir: -1 | 1) {
    if (!content) return;
    const l = listOf(content, path);
    if (!l) return;
    const list = (getAt(content, l.listPath) as Array<PLink | PSocial>).slice();
    const i = list.findIndex((x) => x.id === l.itemId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    change(setAt(content, l.listPath, list));
  }

  function remove(path: string) {
    if (!content) return;
    const l = listOf(content, path);
    if (!l) return;
    const list = (getAt(content, l.listPath) as Array<PLink | PSocial>).filter((x) => x.id !== l.itemId);
    change(setAt(content, l.listPath, list));
    setSelected(null);
  }

  /* ---------- Saving ---------- */

  async function save() {
    if (!content || saving) return;
    setSaving(true);
    try {
      const desktopChanged = saved && JSON.stringify(content) !== JSON.stringify(saved);
      const mobileChanged = JSON.stringify(mobile) !== JSON.stringify(mobileSaved);
      if (!desktopChanged && !mobileChanged) {
        toast("Nothing has changed since the last save", "info");
        return;
      }
      if (desktopChanged) {
        const r = await api<{ content: DesktopContent; updated_at: string; assets: Record<string, string> }>(
          "/api/admin/new-m/page",
          { method: "PUT", json: { view: "desktop", content, base_updated_at: savedAt } },
        );
        const desktop = cleanDesktop(r.content);
        setSaved(desktop);
        setContent(desktop);
        setSavedAt(r.updated_at);
        setAssets((a) => ({ ...a, ...r.assets }));
      }
      if (mobileChanged) {
        const r = await api<{ content: MobileContent; updated_at: string }>("/api/admin/new-m/page", {
          method: "PUT",
          json: { view: "mobile", content: mobile, base_updated_at: mobileAt },
        });
        const m = cleanMobile(r.content);
        setMobileSaved(m);
        setMobile(m);
        setMobileAt(r.updated_at);
      }
      toast("Page saved. Every verification link shows it now.");
    } catch (e) {
      toast(errorMessage(e), "danger");
      if (e instanceof ClientError && e.status === 409) void load();
    } finally {
      setSaving(false);
    }
  }

  /* ---------- Clicks in the preview ---------- */

  function onPreviewClick(e: React.MouseEvent<HTMLDivElement>) {
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
    if (hit) setSelected(hit.dataset.edit as string);
  }

  function reveal(path: string) {
    setSelected(path);
    window.setTimeout(() => {
      const el = previewRef.current?.querySelector(`[data-edit="${CSS.escape(path)}"]`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 30);
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
  if (!content || !saved) return <Loading />;

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[12.5px] text-text-muted">
            <Link href="/admin/new-m" className="hover:underline">
              New M
            </Link>{" "}
            / Verification page
          </div>
          <h1 className="text-lg font-semibold leading-tight mt-0.5">Verification page design</h1>
          <p className="text-text-muted text-sm mt-1 max-w-3xl">
            This is the page every New M verification link opens. Click any text, button, link, tab or logo on it to
            change its wording, where it leads, or hide it; the document&apos;s own values fill in by themselves.
            Text and links are saved in the database, logos in R2.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dirty ? <Badge tone="warn">Unsaved changes</Badge> : savedAt ? <Badge tone="ok">Saved {formatDateTime(savedAt)}</Badge> : <Badge>Design defaults</Badge>}
          <Button icon={<Undo2 className="size-4" />} onClick={undo} disabled={!past.length} title="Undo (Ctrl+Z)">
            Undo
          </Button>
          <Button icon={<Redo2 className="size-4" />} onClick={redo} disabled={!future.length} title="Redo (Ctrl+Shift+Z)">
            Redo
          </Button>
          <Button onClick={() => setConfirm("discard")} disabled={!dirty}>
            Discard changes
          </Button>
          <Button icon={<RotateCcw className="size-4" />} onClick={() => setConfirm("reset")}>
            Reset to design
          </Button>
          <Button variant="primary" icon={<Save className="size-4" />} loading={saving} onClick={() => void save()} disabled={!dirty || !tableReady}>
            Save
          </Button>
        </div>
      </div>

      {!tableReady ? (
        <Alert tone="warn">
          The page design table is not in the database yet, so changes cannot be saved. Run <span className="font-mono">supabase/new-m.sql</span>{" "}
          in Supabase → SQL Editor, then reload this page. Until then every link shows the design as it is below.
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-b">
        <TabButton active={view === "desktop"} onClick={() => setView("desktop")} icon={<Monitor className="size-4" />}>
          Desktop view
        </TabButton>
        <TabButton active={view === "mobile"} onClick={() => setView("mobile")} icon={<Smartphone className="size-4" />}>
          Mobile view
        </TabButton>
        {view === "desktop" ? (
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
        ) : null}
      </div>

      {view === "desktop" ? (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px] items-start">
          <div className="min-w-0 rounded-md border bg-surface overflow-hidden">
            <div className="flex items-center gap-2 px-3 h-9 border-b bg-surface-2 text-[12.5px] text-text-muted">
              <MousePointer2 className="size-3.5" />
              Click anything to edit it · hidden pieces are striped · <span className="font-medium text-text">+</span> adds an item to a list
            </div>
            <div ref={previewRef} className="max-h-[calc(100vh-14rem)] overflow-y-auto" onClickCapture={onPreviewClick}>
              <VerifyPage
                content={content}
                record={showMissing ? null : record}
                assets={assets}
                editor={{ selected }}
              />
            </div>
          </div>

          <aside className="xl:sticky xl:top-4 rounded-md border bg-surface min-w-0">
            {selected ? (
              <Inspector
                key={selected}
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
              />
            ) : (
              <Overview content={content} onChange={update} onPick={reveal} onAdd={addTo} />
            )}
          </aside>
        </div>
      ) : (
        <MobilePanel
          mobile={mobile}
          onChange={setMobile}
          preview={<VerifyPage content={content} record={showMissing ? null : record} assets={assets} preview />}
        />
      )}

      <ConfirmDialog
        open={confirm === "discard"}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setContent(saved);
          setMobile(mobileSaved);
          setPast([]);
          setFuture([]);
          setSelected(null);
          setConfirm(null);
        }}
        title="Discard your changes?"
        confirmLabel="Discard"
        danger
        message="Everything changed since the last save is undone. The page visitors see is not affected."
      />
      <ConfirmDialog
        open={confirm === "reset"}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          change(structuredClone(DEFAULT_DESKTOP));
          setSelected(null);
          setConfirm(null);
        }}
        title="Reset the page to the design?"
        confirmLabel="Reset"
        message={
          <>
            Every text, link, button and logo goes back to the original design. Nothing changes for visitors until you
            press <b>Save</b>, and <b>Undo</b> brings your version back. Uploaded logos are deleted from R2 when you save.
          </>
        }
      />
    </div>
  );
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
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
    </button>
  );
}

/* ---------------- Picking the preview document ---------------- */

function RecordPicker({ onPick, onClose }: { onPick: (r: NewMRecord | null) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<NewMRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(async () => {
      try {
        const r = await api<Paged<NewMRecord>>(`/api/admin/new-m${qs({ q: q.trim(), limit: 12 })}`);
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
  content,
  onChange,
  onPick,
  onAdd,
}: {
  content: DesktopContent;
  onChange: (path: string, value: unknown) => void;
  onPick: (path: string) => void;
  onAdd: (listPath: string) => void;
}) {
  const groups = outline(content);
  return (
    <div>
      <div className="px-4 py-3 border-b">
        <h2 className="text-sm font-semibold">Page settings</h2>
        <div className="mt-3 space-y-3">
          <Field label="Browser tab title" hint="Shown on the browser tab and in bookmarks.">
            <Input value={content.meta.title} onChange={(e) => onChange("meta.title", e.target.value)} />
          </Field>
          <Checkbox
            label="Animate the page as it opens"
            description="Headings rise in, the hero badges float and the shield glows. Visitors who ask their computer for less motion never see it."
            checked={content.meta.animations}
            onChange={(e) => onChange("meta.animations", e.target.checked)}
          />
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
                  <Plus className="size-3.5" /> Add {(NAMES[listPath] ?? "item").toLowerCase()}
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
}: {
  path: string;
  content: DesktopContent;
  assets: Record<string, string>;
  onChange: (path: string, value: unknown) => void;
  onClose: () => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onAddAfter: () => void;
  onUploaded: (key: string, url: string) => void;
}) {
  const value = getAt(content, path);
  const list = listOf(content, path);
  const listItems = list ? (getAt(content, list.listPath) as Array<{ id: string }>) : null;
  const index = list && listItems ? listItems.findIndex((x) => x.id === list.itemId) : -1;
  const set = (field: string, v: unknown) => onChange(`${path}.${field}`, v);

  let body: ReactNode = <p className="text-sm text-text-muted">This piece has no settings.</p>;
  if (path === "document.viewer") {
    body = <ViewerFields content={content} onChange={onChange} />;
  } else if (path.startsWith("record.labels.")) {
    const field = path.split(".")[2] as RecordField;
    body = (
      <>
        <TextFields value={value as PText} set={set} multiline={false} />
        <Alert tone="info">The value under this label is {FIELD_SOURCE[field]}. It changes with every document and is not edited here.</Alert>
      </>
    );
  } else if (path === "record.designation" || path === "record.signature") {
    body = (
      <>
        <VisibleToggle hidden={(value as { hidden: boolean }).hidden} onChange={(h) => set("hidden", h)} />
        <Alert tone="info">
          {path === "record.signature"
            ? "The signature image belongs to the approving officer picked for each document (saved under New M → Saved values)."
            : "The designation belongs to the approving officer picked for each document."}
        </Alert>
      </>
    );
  } else if (path === "hero.art") {
    body = (
      <>
        <VisibleToggle hidden={(value as { hidden: boolean }).hidden} onChange={(h) => set("hidden", h)} />
        <p className="text-[12.5px] text-text-muted">The circles, shield and badges on the right of the hero.</p>
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
          multiline={Boolean(list && LINEBREAK_LISTS.has(list.listPath))}
          widthHint={Boolean(list)}
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
          <div className="text-[11.5px] font-semibold uppercase tracking-wide text-text-faint">Editing</div>
          <h2 className="text-sm font-semibold truncate">{nameOf(path, content)}</h2>
        </div>
        <button type="button" onClick={onClose} className="p-1 text-text-muted hover:text-text" aria-label="Close" title="Close (Esc)">
          <X className="size-4" />
        </button>
      </div>
      <div className="px-4 py-3 space-y-3 max-h-[calc(100vh-16rem)] overflow-y-auto">{body}</div>
      {list && listItems ? (
        <div className="flex flex-wrap items-center gap-1.5 px-4 py-3 border-t bg-surface-2 rounded-b-md">
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
          <Button size="sm" icon={<Plus className="size-3.5" />} onClick={onAddAfter}>
            Add after
          </Button>
          <Button size="sm" icon={<Copy className="size-3.5" />} onClick={onDuplicate}>
            Duplicate
          </Button>
          <Button size="sm" variant="danger" icon={<Trash2 className="size-3.5" />} onClick={onRemove} className="ml-auto">
            Delete
          </Button>
        </div>
      ) : null}
    </div>
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
  widthHint,
}: {
  path: string;
  value: PLink;
  set: (f: string, v: unknown) => void;
  multiline: boolean;
  widthHint: boolean;
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
      <Field label="Icon after the name">
        <Select value={value.icon} onChange={(e) => set("icon", e.target.value as LinkIcon)}>
          {LINK_ICONS.map((i) => (
            <option key={i.value} value={i.value}>
              {i.label}
            </option>
          ))}
        </Select>
      </Field>
      {widthHint ? (
        <Field
          label="Width (design pixels)"
          hint="The page is laid out on a 1062 px wide grid and scales to the window. Leave empty to fit the name."
        >
          <Input
            type="number"
            min={0}
            max={1062}
            step={0.1}
            value={value.width ?? ""}
            onChange={(e) => set("width", e.target.value === "" ? null : Number(e.target.value))}
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

  async function upload(file: File) {
    setBusy(true);
    setProgress(0);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await postFormWithProgress<{ key: string; url: string; content_type: string; filename: string }>(
        "/api/admin/new-m/page/asset",
        form,
        setProgress,
      );
      onUploaded(r.key, r.url);
      onChange(path, { ...value, key: r.key, content_type: r.content_type, filename: r.filename });
      toast("Logo uploaded. Save the page to put it live.");
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
      <p className="text-[12.5px] text-text-muted">
        PNG, JPG, WebP, GIF or SVG up to 2 MB, stored in R2. A square logo fits best; it is scaled to the space in the
        design. {white ? "This one sits on the dark green footer, so a white or light logo reads best." : null}
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

/* ---------------- Mobile ---------------- */

function MobilePanel({ mobile, onChange, preview }: { mobile: MobileContent; onChange: (m: MobileContent) => void; preview: ReactNode }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px] items-start">
      <div className="space-y-3">
        <Alert tone="info">
          The mobile view gets its own design later, with its own settings here. Until then phones show the desktop
          design, scaled to fit the screen exactly as on the right — every change made under Desktop view shows there too.
        </Alert>
        <Field label="Notes for the mobile design" hint="Saved with the page, for whoever designs the mobile view.">
          <Textarea rows={8} value={mobile.note} onChange={(e) => onChange({ ...mobile, note: e.target.value })} />
        </Field>
      </div>
      <div className="mx-auto w-[390px] max-w-full rounded-[2rem] border-8 border-ink-800 bg-ink-800 shadow-xl overflow-hidden">
        <div className="h-[700px] overflow-y-auto bg-white" style={{ pointerEvents: "none" }}>
          {preview}
        </div>
      </div>
    </div>
  );
}
