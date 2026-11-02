import type { CSSProperties, ReactNode } from "react";
import type { DesktopContent, PageRecord, PImage, PLink, PLinkText, PText } from "@/lib/new-m-page";
import { PdfViewer } from "./PdfViewer";
import { ArrowNE, DocLines, Emblem, ShieldTick, Social, Tick } from "./icons";
import "./verify-page.css";

/**
 * The New M verification page, desktop view, drawn from the saved page content and one document.
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

/** One design pixel in CSS, for the few sizes set inline (link widths). */
function u(n: number): string {
  return `calc(var(--u) * ${n})`;
}

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
      <button type="button" className="nmp-add" data-add={listPath} title="Add an item here">
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

  return (
    <div className={cx("nmp", animated && "nmp-anim", editing && "is-editing")}>
      {/* ---------------- Header ---------------- */}
      <header className="nmp-header">
        <div className="nmp-in">
          {image(h.logo, "header.logo", "nmp-logo", "green")}
          {visible(h.title) ? (
            h.title.href && h.title.href !== "#" ? (
              linkText(h.title, "header.title", "nmp-abs nmp-brand-title")
            ) : (
              <span {...ed("header.title", h.title.hidden, "nmp-abs nmp-brand-title")}>{h.title.text}</span>
            )
          ) : null}
          {text(h.subtitle, "header.subtitle", "nmp-abs nmp-brand-sub")}

          <nav className="nmp-toplinks" aria-label="Quick links">
            {h.top_links.map((l) =>
              navLink(
                l,
                `header.top_links.${l.id}`,
                "nmp-toplink",
                <>
                  <span className="nmp-pre">{l.text}</span>
                  {l.icon === "arrow" ? <ArrowNE className="nmp-ico-arrow" /> : null}
                  {l.icon === "shield" ? <ShieldTick className="nmp-ico-arrow" /> : null}
                </>,
                l.width ? { width: u(l.width) } : undefined,
              ),
            )}
            {addButton("header.top_links")}
          </nav>

          <div className="nmp-connect">
            {text(h.connect, "header.connect", "nmp-connect-text")}
            <div className="nmp-socials">
              {h.social.map((s) =>
                visible(s) ? (
                  <a
                    key={s.id}
                    {...ed(`header.social.${s.id}`, s.hidden, "nmp-social")}
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
      <nav className="nmp-nav" aria-label="Main">
        <div className="nmp-in">
          {c.nav.items.map((l) =>
            navLink(
              l,
              `nav.items.${l.id}`,
              cx("nmp-navitem", !l.width && "is-auto"),
              <>
                <span>{l.text}</span>
                {l.icon === "shield" ? <ShieldTick className="nmp-ico-shield" strokeWidth={1.7} /> : null}
                {l.icon === "arrow" ? <ArrowNE className="nmp-ico-shield" /> : null}
              </>,
              l.width ? { width: u(l.width) } : undefined,
            ),
          )}
          {addButton("nav.items")}
        </div>
      </nav>

      {/* ---------------- Hero ---------------- */}
      <section className="nmp-hero">
        <div className="nmp-in">
          {visible(hero.art) ? (
            <div {...ed("hero.art", hero.art.hidden, "nmp-art")} aria-hidden="true">
              <span className="nmp-ring" />
              <span className="nmp-diamond" />
              <span className="nmp-disk" />
              <span className="nmp-shieldbox">
                <ShieldTick strokeWidth={1.9} />
              </span>
              <span className="nmp-badge nmp-badge-doc">
                <DocLines />
              </span>
              <span className="nmp-badge nmp-badge-check">
                <Tick />
              </span>
            </div>
          ) : null}

          <div className="nmp-hero-text">
            <nav className="nmp-crumbs" aria-label="Breadcrumb">
              {hero.crumbs.map((l) =>
                visible(l) ? (
                  <span key={l.id} className="nmp-crumb">
                    {navLink(l, `hero.crumbs.${l.id}`, "nmp-crumb-link")}
                    <span className="nmp-crumb-sep" aria-hidden="true">
                      /
                    </span>
                  </span>
                ) : null,
              )}
              {addButton("hero.crumbs")}
              {text(hero.crumb_current, "hero.crumb_current", "nmp-crumb-current")}
            </nav>

            {text(hero.eyebrow, "hero.eyebrow", "nmp-eyebrow")}
            {visible(hero.title) ? <h1 {...ed("hero.title", hero.title.hidden, "nmp-h1")}>{hero.title.text}</h1> : null}
            {text(hero.title_accent, "hero.title_accent", "nmp-h1b")}
            {visible(hero.lead) ? <p {...ed("hero.lead", hero.lead.hidden, "nmp-lead")}>{hero.lead.text}</p> : null}
          </div>
        </div>
      </section>

      {/* ---------------- Result ---------------- */}
      <main className="nmp-main">
        <div className="nmp-in">
          {r ? (
            <section className="nmp-banner" aria-live="polite">
              {text(c.result.found_title, "result.found_title", "nmp-abs nmp-banner-title")}
              <p className="nmp-abs nmp-banner-line">
                {text(c.result.document_label, "result.document_label", "nmp-banner-label")}
                {visible(c.result.document_label) ? " " : null}
                <strong className="nmp-banner-value">{dash(r.document_type)}</strong>
                <span className="nmp-banner-sep"> · </span>
                {text(c.result.issued_label, "result.issued_label", "nmp-banner-label")}{" "}
                <strong className="nmp-banner-date">{dash(r.issue_date)}</strong>
              </p>
            </section>
          ) : (
            <section className="nmp-banner is-missing" aria-live="polite">
              {text(c.result.missing_title, "result.missing_title", "nmp-abs nmp-banner-title")}
              {visible(c.result.missing_text) ? (
                <p {...ed("result.missing_text", c.result.missing_text.hidden, "nmp-abs nmp-banner-line")}>
                  {c.result.missing_text.text}
                </p>
              ) : null}
            </section>
          )}

          {r ? (
            <div className="nmp-cards">
              {/* Verification record */}
              <article className="nmp-card nmp-card-record">
                <header className="nmp-card-head">
                  {text(rec.eyebrow, "record.eyebrow", "nmp-abs nmp-card-eyebrow")}
                  {visible(rec.title) ? (
                    <h2 {...ed("record.title", rec.title.hidden, "nmp-abs nmp-card-title")}>{rec.title.text}</h2>
                  ) : null}
                </header>
                <div className="nmp-card-body">
                  <div className="nmp-cert">
                    <div className="nmp-cert-head">
                      {image(rec.logo, "record.logo", "nmp-cert-logo", "green")}
                      {text(rec.cert_title, "record.cert_title", "nmp-cert-title")}
                      {text(rec.cert_subtitle, "record.cert_subtitle", "nmp-cert-sub")}
                    </div>
                    <div className="nmp-rows">
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
                          <div key={key} {...ed(`record.labels.${key}`, rec.labels[key].hidden, "nmp-row")}>
                            <span className="nmp-row-label">{rec.labels[key].text}</span>
                            <span className="nmp-row-value">{dash(value)}</span>
                          </div>
                        ) : null,
                      )}
                      {visible(rec.labels.officer) ? (
                        <div {...ed("record.labels.officer", rec.labels.officer.hidden, "nmp-row nmp-row-officer")}>
                          <div className="nmp-officer-text">
                            <span className="nmp-row-label">{rec.labels.officer.text}</span>
                            <span className="nmp-row-value">{dash(r.officer_name)}</span>
                            {visible(rec.designation) && r.officer_designation ? (
                              <span {...ed("record.designation", rec.designation.hidden, "nmp-officer-role")}>
                                {r.officer_designation}
                              </span>
                            ) : null}
                          </div>
                          {visible(rec.signature) && (r.signature_url || editing) ? (
                            <span {...ed("record.signature", rec.signature.hidden, "nmp-signature")}>
                              {r.signature_url ? (
                                // Signatures are signed R2 links that expire; next/image would cache them.
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={r.signature_url} alt={`Signature of ${r.officer_name || "the approving officer"}`} />
                              ) : (
                                <SampleSignature />
                              )}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    {visible(rec.disclaimer) ? (
                      <p {...ed("record.disclaimer", rec.disclaimer.hidden, "nmp-disclaimer")}>{rec.disclaimer.text}</p>
                    ) : null}
                  </div>
                </div>
              </article>

              {/* Supporting document */}
              <article className="nmp-card nmp-card-doc">
                <header className="nmp-card-head">
                  {text(doc.eyebrow, "document.eyebrow", "nmp-abs nmp-card-eyebrow")}
                  {visible(doc.title) ? (
                    <h2 {...ed("document.title", doc.title.hidden, "nmp-abs nmp-card-title")}>{doc.title.text}</h2>
                  ) : null}
                  {visible(doc.open) ? (
                    <a
                      {...ed("document.open", doc.open.hidden, "nmp-open")}
                      {...linkProps(doc.open.href || r.document?.open_url || "#", doc.open.new_tab)}
                    >
                      <span>{doc.open.text}</span>
                      {doc.open.icon === "arrow" ? <ArrowNE className="nmp-ico-arrow" /> : null}
                      {doc.open.icon === "shield" ? <ShieldTick className="nmp-ico-arrow" /> : null}
                    </a>
                  ) : null}
                </header>
                <div {...ed("document.viewer", false, "nmp-viewer-slot")}>
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

          <section className="nmp-cta">
            {visible(c.cta.button)
              ? navLink(
                  c.cta.button,
                  "cta.button",
                  "nmp-cta-button",
                  <>
                    <span>{c.cta.button.text}</span>
                    {c.cta.button.icon === "arrow" ? <ArrowNE className="nmp-ico-arrow" /> : null}
                    {c.cta.button.icon === "shield" ? <ShieldTick className="nmp-ico-arrow" /> : null}
                  </>,
                )
              : null}
            <p className="nmp-help">
              {text(c.cta.help_before, "cta.help_before", "nmp-help-before")}
              {visible(c.cta.help_before) ? " " : null}
              {navLink(c.cta.email, "cta.email", "nmp-help-email")}
              {visible(c.cta.email) ? " " : null}
              {text(c.cta.help_after, "cta.help_after", "nmp-help-after")}
            </p>
          </section>
        </div>
      </main>

      {/* ---------------- Footer ---------------- */}
      <footer className="nmp-footer">
        <div className="nmp-in">
          {visible(f.title) ? <h2 {...ed("footer.title", f.title.hidden, "nmp-abs nmp-ftitle")}>{f.title.text}</h2> : null}
          {navLink(
            f.visit,
            "footer.visit",
            "nmp-visit",
            <>
              <span>{f.visit.text}</span>
              {f.visit.icon === "arrow" ? <ArrowNE className="nmp-ico-arrow" /> : null}
              {f.visit.icon === "shield" ? <ShieldTick className="nmp-ico-arrow" /> : null}
            </>,
          )}
          {image(f.logo, "footer.logo", "nmp-flogo", "white")}
          {visible(f.brand_title) ? (
            f.brand_title.href && f.brand_title.href !== "#" ? (
              linkText(f.brand_title, "footer.brand_title", "nmp-abs nmp-fbrand-title")
            ) : (
              <span {...ed("footer.brand_title", f.brand_title.hidden, "nmp-abs nmp-fbrand-title")}>{f.brand_title.text}</span>
            )
          ) : null}
          {text(f.brand_subtitle, "footer.brand_subtitle", "nmp-abs nmp-fbrand-sub")}
          <div className="nmp-fleft">
            {f.left_links.map((l) => navLink(l, `footer.left_links.${l.id}`, "nmp-fleft-link"))}
            {addButton("footer.left_links")}
          </div>
          <div className="nmp-frows">
            {f.rows.map((row, i) => (
              <div key={i} className="nmp-frow">
                {row.map((l) =>
                  navLink(
                    l,
                    `footer.rows.${i}.${l.id}`,
                    cx("nmp-flink", !l.width && "is-auto"),
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
      <div className="nmp-bottom">
        <div className="nmp-in">
          {text(f.copyright, "footer.copyright", "nmp-copyright") ?? <span />}
          {navLink(f.powered, "footer.powered", "nmp-powered")}
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
