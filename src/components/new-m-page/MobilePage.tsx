import type { CSSProperties, ReactNode } from "react";
import type { MobileContent, PageRecord, PImage, PLink, PLinkText, PText } from "@/lib/new-m-page";
import { MobileMenu } from "./MobileMenu";
import { MobilePdf } from "./MobilePdf";
import { ArrowNE, Emblem, ShieldTick, Social } from "./icons";
import "./verify-page.css";
import "./verify-mobile.css";

/**
 * The New M verification page, mobile view, drawn after the mobile design on its 360 px grid and scaled
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

/** One mobile design pixel, for the few sizes set inline (footer link widths). */
function m(n: number): string {
  return `calc(var(--mu) * ${n})`;
}

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
      <button type="button" className="nmpm-add" data-add={listPath} title="Add an item here">
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

  return (
    <div className={cx("nmpm", animated && "nmpm-anim", editing && "is-editing")}>
      {/* ---------------- Header ---------------- */}
      <header className="nmpm-header">
        <div className="nmpm-in">
          {image(h.logo, "header.logo", "nmpm-logo", "green")}
          <div className="nmpm-brand">
            {titled(h.title, "header.title", "nmpm-brand-title")}
            {text(h.subtitle, "header.subtitle", "nmpm-brand-sub")}
          </div>
          {visible(h.menu_button) ? (
            <MobileMenu
              label={h.menu_button.text || "Menu"}
              buttonProps={editing ? ed("header.menu_button", h.menu_button.hidden) : undefined}
              open={editing ? Boolean(editor?.menuOpen) : undefined}
            >
              <nav className="nmpm-menu" aria-label="Main">
                {menu.items.map((l) =>
                  link(
                    l,
                    `menu.items.${l.id}`,
                    "nmpm-menu-item",
                    <>
                      <span>{l.text}</span>
                      {icon(l, "nmpm-menu-icon")}
                    </>,
                  ),
                )}
                {addButton("menu.items")}
              </nav>
              {menu.extras && (menu.links.some((l) => visible(l)) || editing) ? (
                <div className="nmpm-menu-extra">
                  {text(menu.links_title, "menu.links_title", "nmpm-menu-title")}
                  <div className="nmpm-menu-links">
                    {menu.links.map((l) =>
                      link(
                        l,
                        `menu.links.${l.id}`,
                        "nmpm-menu-link",
                        <>
                          <span>{l.text}</span>
                          {icon(l, "nmpm-menu-link-icon")}
                        </>,
                      ),
                    )}
                    {addButton("menu.links")}
                  </div>
                </div>
              ) : null}
              {menu.extras ? (
              <div className="nmpm-menu-connect">
                {text(menu.connect, "menu.connect", "nmpm-menu-connect-text")}
                <div className="nmpm-menu-socials">
                  {menu.social.map((s) =>
                    visible(s) ? (
                      <a
                        key={s.id}
                        {...ed(`menu.social.${s.id}`, s.hidden, "nmpm-menu-social")}
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
      <section className="nmpm-hero">
        <div className="nmpm-in">
          {visible(hero.art) ? (
            <div {...ed("hero.art", hero.art.hidden, "nmpm-art")} aria-hidden="true">
              <span className="nmpm-ring" />
              <span className="nmpm-disk" />
              <span className="nmpm-shieldbox">
                <ShieldTick strokeWidth={1.9} />
              </span>
            </div>
          ) : null}
          <div className="nmpm-hero-text">
            <nav className="nmpm-crumbs" aria-label="Breadcrumb">
              {hero.crumbs.map((l) =>
                visible(l) ? (
                  <span key={l.id} className="nmpm-crumb">
                    {link(l, `hero.crumbs.${l.id}`, "nmpm-crumb-link")}
                    <span className="nmpm-crumb-sep" aria-hidden="true">
                      /
                    </span>
                  </span>
                ) : null,
              )}
              {addButton("hero.crumbs")}
              {text(hero.crumb_current, "hero.crumb_current", "nmpm-crumb-current")}
            </nav>
            {text(hero.eyebrow, "hero.eyebrow", "nmpm-eyebrow")}
            {visible(hero.title) ? <h1 {...ed("hero.title", hero.title.hidden, "nmpm-h1")}>{hero.title.text}</h1> : null}
            {text(hero.title_accent, "hero.title_accent", "nmpm-h1b")}
            {visible(hero.lead) ? <p {...ed("hero.lead", hero.lead.hidden, "nmpm-lead")}>{hero.lead.text}</p> : null}
          </div>
        </div>
      </section>

      {/* ---------------- Result ---------------- */}
      <main className="nmpm-main">
        <div className="nmpm-in">
          {r ? (
            <section className="nmpm-banner" aria-live="polite">
              {text(c.result.found_title, "result.found_title", "nmpm-banner-title")}
              <p className="nmpm-banner-line">
                {text(c.result.document_label, "result.document_label", "nmpm-banner-label")}
                {visible(c.result.document_label) ? " " : null}
                <strong className="nmpm-banner-value">{dash(r.document_type)}</strong>
                <span className="nmpm-banner-sep"> · </span>
                {text(c.result.issued_label, "result.issued_label", "nmpm-banner-label")}{" "}
                <strong className="nmpm-banner-date">{dash(r.issue_date)}</strong>
              </p>
            </section>
          ) : (
            <section className="nmpm-banner is-missing" aria-live="polite">
              {text(c.result.missing_title, "result.missing_title", "nmpm-banner-title")}
              {visible(c.result.missing_text) ? (
                <p {...ed("result.missing_text", c.result.missing_text.hidden, "nmpm-banner-line")}>{c.result.missing_text.text}</p>
              ) : null}
            </section>
          )}

          {r ? (
            <>
              <article className="nmpm-card nmpm-card-record">
                <header className="nmpm-card-head">
                  {text(rec.eyebrow, "record.eyebrow", "nmpm-card-eyebrow")}
                  {visible(rec.title) ? <h2 {...ed("record.title", rec.title.hidden, "nmpm-card-title")}>{rec.title.text}</h2> : null}
                </header>
                <div className="nmpm-card-body">
                  <div className="nmpm-cert">
                    <div className="nmpm-cert-head">
                      {image(rec.logo, "record.logo", "nmpm-cert-logo", "green")}
                      {text(rec.cert_title, "record.cert_title", "nmpm-cert-title")}
                      {text(rec.cert_subtitle, "record.cert_subtitle", "nmpm-cert-sub")}
                    </div>
                    {(
                      [
                        ["attestation_number", r.attestation_number],
                        ["issue_date", r.issue_date],
                        ["document_type", r.document_type],
                        ["issuing_office", r.issuing_office],
                        ["issuing_authority", r.issuing_authority],
                      ] as const
                    ).map(([key, value]) =>
                      visible(rec.labels[key]) ? (
                        <div key={key} {...ed(`record.labels.${key}`, rec.labels[key].hidden, "nmpm-row")}>
                          <span className="nmpm-row-label">{rec.labels[key].text}</span>
                          <span className="nmpm-row-value">{dash(value)}</span>
                        </div>
                      ) : null,
                    )}
                    {visible(rec.labels.officer) ? (
                      <div {...ed("record.labels.officer", rec.labels.officer.hidden, "nmpm-row nmpm-row-officer")}>
                        <div className="nmpm-officer-text">
                          <span className="nmpm-row-label">{rec.labels.officer.text}</span>
                          <span className="nmpm-row-value">{dash(r.officer_name)}</span>
                          {visible(rec.designation) && r.officer_designation ? (
                            <span {...ed("record.designation", rec.designation.hidden, "nmpm-officer-role")}>{r.officer_designation}</span>
                          ) : null}
                        </div>
                        {visible(rec.signature) && (r.signature_url || editing) ? (
                          <span {...ed("record.signature", rec.signature.hidden, "nmpm-signature")}>
                            {r.signature_url ? (
                              // Signatures are signed R2 links that expire.
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.signature_url} alt={`Signature of ${r.officer_name || "the approving officer"}`} />
                            ) : (
                              <SampleSignature />
                            )}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    {visible(rec.disclaimer) ? <p {...ed("record.disclaimer", rec.disclaimer.hidden, "nmpm-disclaimer")}>{rec.disclaimer.text}</p> : null}
                  </div>
                </div>
              </article>

              <article className="nmpm-card nmpm-card-doc">
                <header className="nmpm-card-head">
                  {text(doc.eyebrow, "document.eyebrow", "nmpm-card-eyebrow")}
                  {visible(doc.title) ? <h2 {...ed("document.title", doc.title.hidden, "nmpm-card-title")}>{doc.title.text}</h2> : null}
                  {visible(doc.open)
                    ? (
                      <a
                        {...ed("document.open", doc.open.hidden, "nmpm-open")}
                        // A phone saves the PDF; a link the super admin typed in is followed instead.
                        {...(doc.open.href ? linkProps(doc.open.href, doc.open.new_tab) : downloadProps(r.document))}
                      >
                        <span>{doc.open.text}</span>
                        {icon(doc.open, "nmpm-open-icon")}
                      </a>
                    )
                    : null}
                </header>
                <div {...ed("document.viewer", false, "nmpm-viewer")}>
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

          <section className="nmpm-cta">
            {visible(c.cta.button)
              ? link(
                  c.cta.button,
                  "cta.button",
                  "nmpm-cta-button",
                  <>
                    <span>{c.cta.button.text}</span>
                    {icon(c.cta.button, "nmpm-cta-icon")}
                  </>,
                )
              : null}
            <p className="nmpm-help">
              {text(c.cta.help_before, "cta.help_before", "nmpm-help-before")}
              {visible(c.cta.help_before) ? " " : null}
              {link(c.cta.email, "cta.email", "nmpm-help-email")}
              {visible(c.cta.email) ? " " : null}
              {text(c.cta.help_after, "cta.help_after", "nmpm-help-after")}
            </p>
          </section>
        </div>
      </main>

      {/* ---------------- Footer ---------------- */}
      <footer className="nmpm-footer">
        <div className="nmpm-in">
          {visible(f.title) ? <h2 {...ed("footer.title", f.title.hidden, "nmpm-ftitle")}>{f.title.text}</h2> : null}
          {link(
            f.visit,
            "footer.visit",
            "nmpm-visit",
            <>
              <span>{f.visit.text}</span>
              {icon(f.visit, "nmpm-visit-icon")}
            </>,
          )}
          <div className="nmpm-fbrand">
            {image(f.logo, "footer.logo", "nmpm-flogo", "white")}
            <div className="nmpm-fbrand-text">
              {titled(f.brand_title, "footer.brand_title", "nmpm-fbrand-title")}
              {text(f.brand_subtitle, "footer.brand_subtitle", "nmpm-fbrand-sub")}
            </div>
          </div>
          <div className="nmpm-fleft">
            {f.left_links.map((l) => link(l, `footer.left_links.${l.id}`, "nmpm-fleft-link"))}
            {addButton("footer.left_links")}
          </div>
          <div className="nmpm-frows">
            {f.rows.map((row, i) => (
              <div key={i} className="nmpm-frow">
                {row.map((l) =>
                  link(l, `footer.rows.${i}.${l.id}`, cx("nmpm-flink", !l.width && "is-auto"), undefined, l.width ? { width: m(l.width) } : undefined),
                )}
                {addButton(`footer.rows.${i}`)}
              </div>
            ))}
          </div>
        </div>
      </footer>
      <div className="nmpm-bottom">
        <div className="nmpm-in">
          {text(f.copyright, "footer.copyright", "nmpm-copyright")}
          {link(f.powered, "footer.powered", "nmpm-powered")}
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
