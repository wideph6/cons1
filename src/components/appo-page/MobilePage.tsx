import type { CSSProperties, ReactNode } from "react";
import type { MobileContent, PageRecord, PImage, PLink, PLinkText, PText } from "@/lib/appo-page";
import { MobileMenu } from "./MobileMenu";
import { MobilePdf } from "./MobilePdf";
import { hasNumbers, RecordRows } from "./RecordRows";
import { ArrowNE, Emblem, ShieldTick, Social } from "./icons";
import "./verify-page.css";
import "./verify-mobile.css";

/**
 * The Appo verification page, mobile view, drawn after the mobile design on its 360 px grid and scaled
 * to the phone's width. Like the desktop view it holds no state of its own (the menu button and the
 * document panel are small client parts), so the server renders it for visitors and the editor renders
 * the same markup, with data-edit on every piece, as its preview.
 */

export interface MobileEditorState {
  selected: string | null;
  /** The editor holds the menu open so its items can be clicked. */
  menuOpen: boolean;
}

export interface MobilePageProps {
  content: MobileContent;
  record: PageRecord | null;
  assets: Record<string, string>;
  editor?: MobileEditorState;
  /** A look-only preview: a sample file in the document panel. */
  preview?: boolean;
}

/** One mobile design pixel, for the few sizes set inline (footer link widths, the certificate box). */
function m(n: number): string {
  return `calc(var(--mu) * ${n})`;
}

/** The certificate box's font choices, as the phone's stylesheet names them. */
const FONTS = {
  serif: "var(--m-serif)",
  sans: "var(--m-sans)",
  arial: '"NMP Arial", Arial, "Helvetica Neue", Helvetica, sans-serif',
};

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function dash(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  return s || "—";
}

export function MobilePage({ content: c, record, assets, editor, preview }: MobilePageProps) {
  const editing = Boolean(editor);

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

  function downloadProps(d: PageRecord["document"]) {
    return d ? { href: d.download_url, download: d.filename } : { href: "#" };
  }

  function addButton(listPath: string, label = "+") {
    if (!editing) return null;
    return (
      <button type="button" className="apom-add" data-add={listPath} title="Add an item here">
        {label}
      </button>
    );
  }

  function text(item: PText, path: string, className: string, style?: CSSProperties) {
    if (!visible(item)) return null;
    return (
      <span {...ed(path, item.hidden, className)} style={style}>
        {item.text}
      </span>
    );
  }

  function titled(item: PLinkText, path: string, className: string) {
    if (!visible(item)) return null;
    const p = ed(path, item.hidden, className);
    if (item.href && item.href !== "#") {
      return (
        <a {...p} {...linkProps(item.href, item.new_tab)}>
          {item.text}
        </a>
      );
    }
    return <span {...p}>{item.text}</span>;
  }

  function image(img: PImage, path: string, className: string, tone: "green" | "white") {
    if (!visible(img)) return null;
    const url = img.key ? assets[img.key] : null;
    const inner = url ? (
      // Logos are signed R2 links; next/image would need every R2 host configured.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={img.alt} />
    ) : (
      <Emblem tone={tone} />
    );
    const p = ed(path, img.hidden, className);
    if (img.href && img.href !== "#") {
      return (
        <a {...p} {...linkProps(img.href, img.new_tab)} aria-label={img.alt || undefined}>
          {inner}
        </a>
      );
    }
    return (
      <span {...p} role={url ? undefined : "img"} aria-label={url ? undefined : img.alt || undefined}>
        {inner}
      </span>
    );
  }

  function link(item: PLink, path: string, className: string, children?: ReactNode, style?: CSSProperties) {
    if (!visible(item)) return null;
    return (
      <a key={item.id} {...ed(path, item.hidden, className)} {...linkProps(item.href, item.new_tab)} style={style}>
        {children ?? item.text}
      </a>
    );
  }

  function icon(item: PLink, className: string) {
    if (item.icon === "arrow") return <ArrowNE className={className} />;
    if (item.icon === "shield") return <ShieldTick className={className} />;
    return null;
  }

  const h = c.header;
  const menu = c.menu;
  const hero = c.hero;
  const rec = c.record;
  const doc = c.document;
  const f = c.footer;
  const r = record;
  const animated = c.meta.animations && !editing && !preview;
  // The entries keep a gutter for their numbers only while any entry shown has one.
  const numbered = hasNumbers(rec.rows, visible);

  return (
    <div className={cx("apom", animated && "apom-anim", editing && "is-editing")}>
      {/* ---------------- Header ---------------- */}
      <header className="apom-header">
        <div className="apom-in">
          {image(h.logo, "header.logo", "apom-logo", "green")}
          <div className="apom-brand">
            {titled(h.title, "header.title", "apom-brand-title")}
            {text(h.subtitle, "header.subtitle", "apom-brand-sub")}
          </div>
          {visible(h.menu_button) ? (
            <MobileMenu
              label={h.menu_button.text || "Menu"}
              buttonProps={editing ? ed("header.menu_button", h.menu_button.hidden) : undefined}
              open={editing ? Boolean(editor?.menuOpen) : undefined}
            >
              <nav className="apom-menu" aria-label="Main">
                {menu.items.map((l) =>
                  link(
                    l,
                    `menu.items.${l.id}`,
                    "apom-menu-item",
                    <>
                      <span>{l.text}</span>
                      {icon(l, "apom-menu-icon")}
                    </>,
                  ),
                )}
                {addButton("menu.items")}
              </nav>
              {menu.extras && (menu.links.some((l) => visible(l)) || editing) ? (
                <div className="apom-menu-extra">
                  {text(menu.links_title, "menu.links_title", "apom-menu-title")}
                  <div className="apom-menu-links">
                    {menu.links.map((l) =>
                      link(
                        l,
                        `menu.links.${l.id}`,
                        "apom-menu-link",
                        <>
                          <span>{l.text}</span>
                          {icon(l, "apom-menu-link-icon")}
                        </>,
                      ),
                    )}
                    {addButton("menu.links")}
                  </div>
                </div>
              ) : null}
              {menu.extras ? (
              <div className="apom-menu-connect">
                {text(menu.connect, "menu.connect", "apom-menu-connect-text")}
                <div className="apom-menu-socials">
                  {menu.social.map((s) =>
                    visible(s) ? (
                      <a
                        key={s.id}
                        {...ed(`menu.social.${s.id}`, s.hidden, "apom-menu-social")}
                        {...linkProps(s.href, s.new_tab)}
                        aria-label={s.label}
                        title={s.label}
                      >
                        <Social icon={s.icon} />
                      </a>
                    ) : null,
                  )}
                  {addButton("menu.social")}
                </div>
              </div>
              ) : null}
            </MobileMenu>
          ) : null}
        </div>
      </header>

      {/* ---------------- Hero ---------------- */}
      <section className="apom-hero">
        <div className="apom-in">
          {visible(hero.art) ? (
            <div {...ed("hero.art", hero.art.hidden, "apom-art")} aria-hidden="true">
              <span className="apom-ring" />
              <span className="apom-disk" />
              <span className="apom-shieldbox">
                <ShieldTick strokeWidth={1.9} />
              </span>
            </div>
          ) : null}
          <div className="apom-hero-text">
            <nav className="apom-crumbs" aria-label="Breadcrumb">
              {hero.crumbs.map((l) =>
                visible(l) ? (
                  <span key={l.id} className="apom-crumb">
                    {link(l, `hero.crumbs.${l.id}`, "apom-crumb-link")}
                    <span className="apom-crumb-sep" aria-hidden="true">
                      /
                    </span>
                  </span>
                ) : null,
              )}
              {addButton("hero.crumbs")}
              {text(hero.crumb_current, "hero.crumb_current", "apom-crumb-current")}
            </nav>
            {text(hero.eyebrow, "hero.eyebrow", "apom-eyebrow")}
            {visible(hero.title) ? <h1 {...ed("hero.title", hero.title.hidden, "apom-h1")}>{hero.title.text}</h1> : null}
            {text(hero.title_accent, "hero.title_accent", "apom-h1b")}
            {visible(hero.lead) ? <p {...ed("hero.lead", hero.lead.hidden, "apom-lead")}>{hero.lead.text}</p> : null}
          </div>
        </div>
      </section>

      {/* ---------------- Result ---------------- */}
      <main className="apom-main">
        <div className="apom-in">
          {r ? (
            <section className="apom-banner" aria-live="polite">
              {text(c.result.found_title, "result.found_title", "apom-banner-title")}
              <p className="apom-banner-line">
                {text(c.result.document_label, "result.document_label", "apom-banner-label")}
                {visible(c.result.document_label) ? " " : null}
                <strong className="apom-banner-value">{dash(r.document_type)}</strong>
                <span className="apom-banner-sep"> · </span>
                {text(c.result.issued_label, "result.issued_label", "apom-banner-label")}{" "}
                <strong className="apom-banner-date">{dash(r.issue_date)}</strong>
              </p>
            </section>
          ) : (
            <section className="apom-banner is-missing" aria-live="polite">
              {text(c.result.missing_title, "result.missing_title", "apom-banner-title")}
              {visible(c.result.missing_text) ? (
                <p {...ed("result.missing_text", c.result.missing_text.hidden, "apom-banner-line")}>{c.result.missing_text.text}</p>
              ) : null}
            </section>
          )}

          {r ? (
            <>
              <article className="apom-card apom-card-record">
                <header className="apom-card-head">
                  {text(rec.eyebrow, "record.eyebrow", "apom-card-eyebrow")}
                  {visible(rec.title) ? <h2 {...ed("record.title", rec.title.hidden, "apom-card-title")}>{rec.title.text}</h2> : null}
                </header>
                <div className="apom-card-body">
                  <div className={cx("apom-cert", numbered && "has-numbers")}>
                    <div className="apom-cert-head">
                      {image(rec.logo, "record.logo", "apom-cert-logo", "green")}
                      {text(rec.cert_title, "record.cert_title", "apom-cert-title")}
                      {text(rec.cert_subtitle, "record.cert_subtitle", "apom-cert-sub")}
                    </div>
                    <RecordRows
                      p="apom"
                      rec={rec}
                      r={r}
                      unit={m}
                      fonts={FONTS}
                      ed={ed}
                      visible={visible}
                      editing={editing}
                      sampleSignature={<SampleSignature />}
                    />
                    {visible(rec.disclaimer) ? <p {...ed("record.disclaimer", rec.disclaimer.hidden, "apom-disclaimer")}>{rec.disclaimer.text}</p> : null}
                  </div>
                </div>
              </article>

              <article className="apom-card apom-card-doc">
                <header className="apom-card-head">
                  {text(doc.eyebrow, "document.eyebrow", "apom-card-eyebrow")}
                  {visible(doc.title) ? <h2 {...ed("document.title", doc.title.hidden, "apom-card-title")}>{doc.title.text}</h2> : null}
                  {visible(doc.open)
                    ? (
                      <a
                        {...ed("document.open", doc.open.hidden, "apom-open")}
                        // A phone saves the PDF; a link the super admin typed in is followed instead.
                        {...(doc.open.href ? linkProps(doc.open.href, doc.open.new_tab) : downloadProps(r.document))}
                      >
                        <span>{doc.open.text}</span>
                        {icon(doc.open, "apom-open-icon")}
                      </a>
                    )
                    : null}
                </header>
                <div {...ed("document.viewer", false, "apom-viewer")}>
                  <MobilePdf
                    document={r.document}
                    mode={doc.viewer.mode}
                    buttonText={doc.viewer.button.text}
                    buttonHidden={!visible(doc.viewer.button)}
                    showFilename={visible(doc.viewer.filename)}
                    preview={editing || preview}
                    buttonProps={editing ? ed("document.viewer.button", doc.viewer.button.hidden) : undefined}
                    filenameProps={editing ? ed("document.viewer.filename", doc.viewer.filename.hidden) : undefined}
                  />
                </div>
              </article>
            </>
          ) : null}

          <section className="apom-cta">
            {visible(c.cta.button)
              ? link(
                  c.cta.button,
                  "cta.button",
                  "apom-cta-button",
                  <>
                    <span>{c.cta.button.text}</span>
                    {icon(c.cta.button, "apom-cta-icon")}
                  </>,
                )
              : null}
            <p className="apom-help">
              {text(c.cta.help_before, "cta.help_before", "apom-help-before")}
              {visible(c.cta.help_before) ? " " : null}
              {link(c.cta.email, "cta.email", "apom-help-email")}
              {visible(c.cta.email) ? " " : null}
              {text(c.cta.help_after, "cta.help_after", "apom-help-after")}
            </p>
          </section>
        </div>
      </main>

      {/* ---------------- Footer ---------------- */}
      <footer className="apom-footer">
        <div className="apom-in">
          {visible(f.title) ? <h2 {...ed("footer.title", f.title.hidden, "apom-ftitle")}>{f.title.text}</h2> : null}
          {link(
            f.visit,
            "footer.visit",
            "apom-visit",
            <>
              <span>{f.visit.text}</span>
              {icon(f.visit, "apom-visit-icon")}
            </>,
          )}
          <div className="apom-fbrand">
            {image(f.logo, "footer.logo", "apom-flogo", "white")}
            <div className="apom-fbrand-text">
              {titled(f.brand_title, "footer.brand_title", "apom-fbrand-title")}
              {text(f.brand_subtitle, "footer.brand_subtitle", "apom-fbrand-sub")}
            </div>
          </div>
          <div className="apom-fleft">
            {f.left_links.map((l) => link(l, `footer.left_links.${l.id}`, "apom-fleft-link"))}
            {addButton("footer.left_links")}
          </div>
          <div className="apom-frows">
            {f.rows.map((row, i) => (
              <div key={i} className="apom-frow">
                {row.map((l) =>
                  link(l, `footer.rows.${i}.${l.id}`, cx("apom-flink", !l.width && "is-auto"), undefined, l.width ? { width: m(l.width) } : undefined),
                )}
                {addButton(`footer.rows.${i}`)}
              </div>
            ))}
          </div>
        </div>
      </footer>
      <div className="apom-bottom">
        <div className="apom-in">
          {text(f.copyright, "footer.copyright", "apom-copyright")}
          {link(f.powered, "footer.powered", "apom-powered")}
        </div>
      </div>
    </div>
  );
}

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
    </svg>
  );
}
