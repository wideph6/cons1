import type { CSSProperties, ReactNode } from "react";
import type { DesktopContent, PageRecord, PImage, PLink, PLinkText, PText } from "@/lib/appo-page";
import { PdfViewer } from "./PdfViewer";
import { hasNumbers, RecordRows } from "./RecordRows";
import { ArrowNE, DocLines, Emblem, ShieldTick, Social, Tick } from "./icons";
import "./verify-page.css";

/**
 * The Appo verification page, desktop view, drawn from the saved page content and one document.
 *
 * It holds no state of its own, so the server renders it for visitors and the editor renders the very
 * same markup as its preview. In the editor every editable piece carries data-edit (its path in the
 * content), hidden pieces stay visible but faded so they can be clicked and shown again, and every
 * list ends in a "+" that adds an item.
 */

export interface EditorState {
  /** The path of the piece open in the editor's side panel. */
  selected: string | null;
}

export interface VerifyPageProps {
  content: DesktopContent;
  /** The document the address points at; null shows the "no matching record" page. */
  record: PageRecord | null;
  /** Signed links to uploaded logos, by storage key. */
  assets: Record<string, string>;
  /** Present in the editor only. */
  editor?: EditorState;
  /** A look-only preview in the panel: the viewer shows a sample page when there is no PDF. */
  preview?: boolean;
}

/** One design pixel in CSS, for the few sizes set inline (link widths, the certificate box). */
function u(n: number): string {
  return `calc(var(--u) * ${n})`;
}

/** The certificate box's font choices, as this view's stylesheet names them. */
const FONTS = { serif: "var(--apo-serif)", sans: "var(--apo-sans)", arial: "var(--apo-arial)" };

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function dash(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  return s || "—";
}

export function VerifyPage({ content: c, record, assets, editor, preview }: VerifyPageProps) {
  const editing = Boolean(editor);

  /** Props marking a piece as editable, and whether it is drawn at all. */
  function ed(path: string, hidden = false, extra?: string) {
    if (!editing) return { className: extra || undefined };
    return {
      "data-edit": path,
      className: cx(extra, editor?.selected === path && "is-selected", hidden && "is-hidden-item") || undefined,
    };
  }

  function visible(item: { hidden: boolean }): boolean {
    return editing || !item.hidden;
  }

  function linkProps(href: string, newTab: boolean) {
    const target = href && href !== "#" ? href : undefined;
    return {
      href: target ?? "#",
      ...(newTab && target ? { target: "_blank", rel: "noopener noreferrer" } : {}),
    };
  }

  function addButton(listPath: string, label = "+") {
    if (!editing) return null;
    return (
      <button type="button" className="apo-add" data-add={listPath} title="Add an item here">
        {label}
      </button>
    );
  }

  function text(item: PText, path: string, className: string, style?: CSSProperties) {
    if (!visible(item)) return null;
    const p = ed(path, item.hidden, className);
    return (
      <span {...p} style={style}>
        {item.text}
      </span>
    );
  }

  function linkText(item: PLinkText, path: string, className: string) {
    if (!visible(item)) return null;
    const p = ed(path, item.hidden, className);
    return (
      <a {...p} {...linkProps(item.href, item.new_tab)}>
        {item.text}
      </a>
    );
  }

  function image(img: PImage, path: string, className: string, tone: "green" | "white") {
    if (!visible(img)) return null;
    const url = img.key ? assets[img.key] : null;
    const inner = url ? (
      // Logos come from R2 through short-lived signed links; next/image would need every R2 host configured.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={img.alt} />
    ) : (
      <Emblem tone={tone} />
    );
    const p = ed(path, img.hidden, className);
    const label = img.alt || undefined;
    if (img.href && img.href !== "#") {
      return (
        <a {...p} {...linkProps(img.href, img.new_tab)} aria-label={label}>
          {inner}
        </a>
      );
    }
    return (
      <span {...p} role={url ? undefined : "img"} aria-label={url ? undefined : label}>
        {inner}
      </span>
    );
  }

  function navLink(item: PLink, path: string, className: string, children?: ReactNode, style?: CSSProperties) {
    if (!visible(item)) return null;
    const p = ed(path, item.hidden, className);
    return (
      <a key={item.id} {...p} {...linkProps(item.href, item.new_tab)} style={style}>
        {children ?? item.text}
      </a>
    );
  }

  const h = c.header;
  const hero = c.hero;
  const rec = c.record;
  const doc = c.document;
  const f = c.footer;
  const r = record;
  const animated = c.meta.animations && !editing && !preview;
  // The entries keep a gutter for their numbers only while any entry shown has one.
  const numbered = hasNumbers(rec.rows, visible);

  return (
    <div className={cx("apo", animated && "apo-anim", editing && "is-editing")}>
      {/* ---------------- Header ---------------- */}
      <header className="apo-header">
        <div className="apo-in">
          {image(h.logo, "header.logo", "apo-logo", "green")}
          {visible(h.title) ? (
            h.title.href && h.title.href !== "#" ? (
              linkText(h.title, "header.title", "apo-abs apo-brand-title")
            ) : (
              <span {...ed("header.title", h.title.hidden, "apo-abs apo-brand-title")}>{h.title.text}</span>
            )
          ) : null}
          {text(h.subtitle, "header.subtitle", "apo-abs apo-brand-sub")}

          <nav className="apo-toplinks" aria-label="Quick links">
            {h.top_links.map((l) =>
              navLink(
                l,
                `header.top_links.${l.id}`,
                "apo-toplink",
                <>
                  <span className="apo-pre">{l.text}</span>
                  {l.icon === "arrow" ? <ArrowNE className="apo-ico-arrow" /> : null}
                  {l.icon === "shield" ? <ShieldTick className="apo-ico-arrow" /> : null}
                </>,
                l.width ? { width: u(l.width) } : undefined,
              ),
            )}
            {addButton("header.top_links")}
          </nav>

          <div className="apo-connect">
            {text(h.connect, "header.connect", "apo-connect-text")}
            <div className="apo-socials">
              {h.social.map((s) =>
                visible(s) ? (
                  <a
                    key={s.id}
                    {...ed(`header.social.${s.id}`, s.hidden, "apo-social")}
                    {...linkProps(s.href, s.new_tab)}
                    aria-label={s.label}
                    title={s.label}
                  >
                    <Social icon={s.icon} />
                  </a>
                ) : null,
              )}
              {addButton("header.social")}
            </div>
          </div>
        </div>
      </header>

      {/* ---------------- Navigation ---------------- */}
      <nav className="apo-nav" aria-label="Main">
        <div className="apo-in">
          {c.nav.items.map((l) =>
            navLink(
              l,
              `nav.items.${l.id}`,
              cx("apo-navitem", !l.width && "is-auto"),
              <>
                <span>{l.text}</span>
                {l.icon === "shield" ? <ShieldTick className="apo-ico-shield" strokeWidth={1.7} /> : null}
                {l.icon === "arrow" ? <ArrowNE className="apo-ico-shield" /> : null}
              </>,
              l.width ? { width: u(l.width) } : undefined,
            ),
          )}
          {addButton("nav.items")}
        </div>
      </nav>

      {/* ---------------- Hero ---------------- */}
      <section className="apo-hero">
        <div className="apo-in">
          {visible(hero.art) ? (
            <div {...ed("hero.art", hero.art.hidden, "apo-art")} aria-hidden="true">
              <span className="apo-ring" />
              <span className="apo-diamond" />
              <span className="apo-disk" />
              <span className="apo-shieldbox">
                <ShieldTick strokeWidth={1.9} />
              </span>
              <span className="apo-badge apo-badge-doc">
                <DocLines />
              </span>
              <span className="apo-badge apo-badge-check">
                <Tick />
              </span>
            </div>
          ) : null}

          <div className="apo-hero-text">
            <nav className="apo-crumbs" aria-label="Breadcrumb">
              {hero.crumbs.map((l) =>
                visible(l) ? (
                  <span key={l.id} className="apo-crumb">
                    {navLink(l, `hero.crumbs.${l.id}`, "apo-crumb-link")}
                    <span className="apo-crumb-sep" aria-hidden="true">
                      /
                    </span>
                  </span>
                ) : null,
              )}
              {addButton("hero.crumbs")}
              {text(hero.crumb_current, "hero.crumb_current", "apo-crumb-current")}
            </nav>

            {text(hero.eyebrow, "hero.eyebrow", "apo-eyebrow")}
            {visible(hero.title) ? <h1 {...ed("hero.title", hero.title.hidden, "apo-h1")}>{hero.title.text}</h1> : null}
            {text(hero.title_accent, "hero.title_accent", "apo-h1b")}
            {visible(hero.lead) ? <p {...ed("hero.lead", hero.lead.hidden, "apo-lead")}>{hero.lead.text}</p> : null}
          </div>
        </div>
      </section>

      {/* ---------------- Result ---------------- */}
      <main className="apo-main">
        <div className="apo-in">
          {r ? (
            <section className="apo-banner" aria-live="polite">
              {text(c.result.found_title, "result.found_title", "apo-abs apo-banner-title")}
              <p className="apo-abs apo-banner-line">
                {text(c.result.document_label, "result.document_label", "apo-banner-label")}
                {visible(c.result.document_label) ? " " : null}
                <strong className="apo-banner-value">{dash(r.document_type)}</strong>
                <span className="apo-banner-sep"> · </span>
                {text(c.result.issued_label, "result.issued_label", "apo-banner-label")}{" "}
                <strong className="apo-banner-date">{dash(r.issue_date)}</strong>
              </p>
            </section>
          ) : (
            <section className="apo-banner is-missing" aria-live="polite">
              {text(c.result.missing_title, "result.missing_title", "apo-abs apo-banner-title")}
              {visible(c.result.missing_text) ? (
                <p {...ed("result.missing_text", c.result.missing_text.hidden, "apo-abs apo-banner-line")}>
                  {c.result.missing_text.text}
                </p>
              ) : null}
            </section>
          )}

          {r ? (
            <div className="apo-cards">
              {/* Verification record */}
              <article className="apo-card apo-card-record">
                <header className="apo-card-head">
                  {text(rec.eyebrow, "record.eyebrow", "apo-abs apo-card-eyebrow")}
                  {visible(rec.title) ? (
                    <h2 {...ed("record.title", rec.title.hidden, "apo-abs apo-card-title")}>{rec.title.text}</h2>
                  ) : null}
                </header>
                <div className="apo-card-body">
                  <div className="apo-cert">
                    <div className="apo-cert-head">
                      {image(rec.logo, "record.logo", "apo-cert-logo", "green")}
                      {text(rec.cert_title, "record.cert_title", "apo-cert-title")}
                      {text(rec.cert_subtitle, "record.cert_subtitle", "apo-cert-sub")}
                    </div>
                    <div className={cx("apo-rows", numbered && "has-numbers")}>
                      <RecordRows
                        p="apo"
                        rec={rec}
                        r={r}
                        unit={u}
                        fonts={FONTS}
                        ed={ed}
                        visible={visible}
                        editing={editing}
                        sampleSignature={<SampleSignature />}
                      />
                    </div>
                    {visible(rec.disclaimer) ? (
                      <p {...ed("record.disclaimer", rec.disclaimer.hidden, "apo-disclaimer")}>{rec.disclaimer.text}</p>
                    ) : null}
                  </div>
                </div>
              </article>

              {/* Supporting document */}
              <article className="apo-card apo-card-doc">
                <header className="apo-card-head">
                  {text(doc.eyebrow, "document.eyebrow", "apo-abs apo-card-eyebrow")}
                  {visible(doc.title) ? (
                    <h2 {...ed("document.title", doc.title.hidden, "apo-abs apo-card-title")}>{doc.title.text}</h2>
                  ) : null}
                  {visible(doc.open) ? (
                    <a
                      {...ed("document.open", doc.open.hidden, "apo-open")}
                      {...linkProps(doc.open.href || r.document?.open_url || "#", doc.open.new_tab)}
                    >
                      <span>{doc.open.text}</span>
                      {doc.open.icon === "arrow" ? <ArrowNE className="apo-ico-arrow" /> : null}
                      {doc.open.icon === "shield" ? <ShieldTick className="apo-ico-arrow" /> : null}
                    </a>
                  ) : null}
                </header>
                <div {...ed("document.viewer", false, "apo-viewer-slot")}>
                  <PdfViewer
                    document={r.document}
                    tools={doc.viewer.tools}
                    sidebarOpen={doc.viewer.sidebar_open}
                    preview={editing || preview}
                  />
                </div>
              </article>
            </div>
          ) : null}

          <section className="apo-cta">
            {visible(c.cta.button)
              ? navLink(
                  c.cta.button,
                  "cta.button",
                  "apo-cta-button",
                  <>
                    <span>{c.cta.button.text}</span>
                    {c.cta.button.icon === "arrow" ? <ArrowNE className="apo-ico-arrow" /> : null}
                    {c.cta.button.icon === "shield" ? <ShieldTick className="apo-ico-arrow" /> : null}
                  </>,
                )
              : null}
            <p className="apo-help">
              {text(c.cta.help_before, "cta.help_before", "apo-help-before")}
              {visible(c.cta.help_before) ? " " : null}
              {navLink(c.cta.email, "cta.email", "apo-help-email")}
              {visible(c.cta.email) ? " " : null}
              {text(c.cta.help_after, "cta.help_after", "apo-help-after")}
            </p>
          </section>
        </div>
      </main>

      {/* ---------------- Footer ---------------- */}
      <footer className="apo-footer">
        <div className="apo-in">
          {visible(f.title) ? <h2 {...ed("footer.title", f.title.hidden, "apo-abs apo-ftitle")}>{f.title.text}</h2> : null}
          {navLink(
            f.visit,
            "footer.visit",
            "apo-visit",
            <>
              <span>{f.visit.text}</span>
              {f.visit.icon === "arrow" ? <ArrowNE className="apo-ico-arrow" /> : null}
              {f.visit.icon === "shield" ? <ShieldTick className="apo-ico-arrow" /> : null}
            </>,
          )}
          {image(f.logo, "footer.logo", "apo-flogo", "white")}
          {visible(f.brand_title) ? (
            f.brand_title.href && f.brand_title.href !== "#" ? (
              linkText(f.brand_title, "footer.brand_title", "apo-abs apo-fbrand-title")
            ) : (
              <span {...ed("footer.brand_title", f.brand_title.hidden, "apo-abs apo-fbrand-title")}>{f.brand_title.text}</span>
            )
          ) : null}
          {text(f.brand_subtitle, "footer.brand_subtitle", "apo-abs apo-fbrand-sub")}
          <div className="apo-fleft">
            {f.left_links.map((l) => navLink(l, `footer.left_links.${l.id}`, "apo-fleft-link"))}
            {addButton("footer.left_links")}
          </div>
          <div className="apo-frows">
            {f.rows.map((row, i) => (
              <div key={i} className="apo-frow">
                {row.map((l) =>
                  navLink(
                    l,
                    `footer.rows.${i}.${l.id}`,
                    cx("apo-flink", !l.width && "is-auto"),
                    undefined,
                    l.width ? { width: u(l.width) } : undefined,
                  ),
                )}
                {addButton(`footer.rows.${i}`)}
              </div>
            ))}
          </div>
        </div>
      </footer>
      <div className="apo-bottom">
        <div className="apo-in">
          {text(f.copyright, "footer.copyright", "apo-copyright") ?? <span />}
          {navLink(f.powered, "footer.powered", "apo-powered")}
        </div>
      </div>
    </div>
  );
}

/** Stands in for a signature in the editor when the sample document has none. */
function SampleSignature() {
  return (
    <svg viewBox="0 0 140 34" style={{ width: "94%", height: "auto" }} aria-hidden="true">
      <path
        d="M4 22c10-9 34-11 54-4 6 2 2 6-6 6H8m54-2c8 0 10-14 12-20 1 8-1 18 0 22m8-6c6 0 14-1 16-6m8 0c-1 6 0 10 1 12m8-14c3 2 6 1 8-2m-5-2 3 3m8 6c6-2 10-6 12-10 0 6 0 10-2 14"
        fill="none"
        stroke="#2633d0"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="96" cy="28" r="1.2" fill="#2633d0" />
      <circle cx="100" cy="31" r="1.2" fill="#2633d0" />
    </svg>
  );
}
