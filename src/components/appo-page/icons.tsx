import type { SocialIcon } from "@/lib/appo-page";

/**
 * Drawings used by the Appo verification page. Plain SVG with no hooks, so the page renders on the
 * server and in the editor alike.
 */

type SvgProps = { className?: string; style?: React.CSSProperties };

/**
 * The built-in emblem, shown until the super admin uploads a logo: a ring with a crescent and star
 * over "NOTARY PUBLIC / AND LEGAL / SERVICES". textLength keeps each line the same width whatever
 * font the visitor's computer has.
 */
export function Emblem({ tone = "green", className, style }: SvgProps & { tone?: "green" | "white" }) {
  const c = tone === "white" ? "#ffffff" : "#18822f";
  return (
    <svg viewBox="0 0 100 100" className={className} style={style} role="img" aria-hidden="true">
      <circle cx="50" cy="50" r="48.6" fill="none" stroke={c} strokeWidth="1.9" />
      <path
        fill={c}
        fillRule="evenodd"
        d="M48.8 9.1a14.9 14.9 0 1 0 12.2 23.4a12.4 12.4 0 1 1 -12.2 -23.4z"
      />
      <path
        fill={c}
        d="M57.9 9.1l1.45 4.1 4.35.1-3.45 2.65 1.25 4.15-3.6-2.45-3.6 2.45 1.25-4.15-3.45-2.65 4.35-.1z"
      />
      <text
        x="50"
        y="52.9"
        textAnchor="middle"
        textLength="83.4"
        lengthAdjust="spacingAndGlyphs"
        fill={c}
        stroke={c}
        strokeWidth="0.5"
        style={{ font: "700 15.6px 'Arial Narrow', 'NMP Arial', Arial, sans-serif" }}
      >
        NOTARY PUBLIC
      </text>
      <text
        x="50.4"
        y="65.7"
        textAnchor="middle"
        textLength="71.2"
        lengthAdjust="spacingAndGlyphs"
        fill={c}
        style={{ font: "600 14.6px 'NMP Arial', Arial, sans-serif" }}
      >
        AND LEGAL
      </text>
      <text
        x="50.4"
        y="79.1"
        textAnchor="middle"
        textLength="61.6"
        lengthAdjust="spacingAndGlyphs"
        fill={c}
        style={{ font: "600 14.6px 'NMP Arial', Arial, sans-serif" }}
      >
        SERVICES
      </text>
    </svg>
  );
}

/** Small arrow pointing up and to the right, as after "Applicant Portal" and "Open document". */
export function ArrowNE({ className, style }: SvgProps) {
  return (
    <svg viewBox="0 0 10 10" className={className} style={style} aria-hidden="true" fill="none">
      <path d="M2.2 7.8L7.6 2.4M3.4 2.3h4.3v4.3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The shield with a tick beside "Verify Document". */
export function ShieldTick({ className, style, strokeWidth = 1.6 }: SvgProps & { strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden="true" fill="none">
      <path
        d="M12 2.6l7.6 2.9v5.9c0 4.7-3.1 8.6-7.6 10-4.5-1.4-7.6-5.3-7.6-10V5.5z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <path d="M8.4 12.1l2.5 2.5 4.8-5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DocLines({ className, style }: SvgProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden="true" fill="none">
      <path
        d="M14 2.8H6.8a2 2 0 0 0-2 2v14.4a2 2 0 0 0 2 2h10.4a2 2 0 0 0 2-2V8z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M14 2.8V8h5.2M8.6 12.6h6.8M8.6 16.4h6.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Tick({ className, style }: SvgProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden="true" fill="none">
      <path d="M5.5 12.6l4.2 4.2 8.8-9.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Footer heading dash and other plain shapes are drawn in CSS; social marks are drawn here. */
export function Social({ icon, className, style }: SvgProps & { icon: SocialIcon }) {
  const common = { className, style, "aria-hidden": true as const };
  switch (icon) {
    case "x":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path
            fill="currentColor"
            d="M3 3h5.6l4.4 6.1L18.3 3h2.6l-6.7 7.7L21.6 21H16l-4.7-6.5L5.5 21H2.9l7.2-8.3zm3.7 1.7l10.2 14.6h1.8L8.5 4.7z"
          />
        </svg>
      );
    case "facebook":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path
            fill="currentColor"
            d="M13.6 22v-8.4h2.9l.5-3.5h-3.4V7.9c0-1 .4-1.8 1.9-1.8h1.6V3c-.3 0-1.3-.1-2.5-.1-2.6 0-4.3 1.6-4.3 4.4v2.8H7.4v3.5h2.9V22z"
          />
        </svg>
      );
    case "linkedin":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path
            fill="currentColor"
            d="M3.2 8.6h3.9V21H3.2zM5.2 2.6a2.3 2.3 0 1 1 0 4.6 2.3 2.3 0 0 1 0-4.6zM9.4 8.6h3.7v1.7h.1c.5-1 1.8-2 3.7-2 3.9 0 4.6 2.6 4.6 5.9V21h-3.9v-6c0-1.4 0-3.3-2-3.3s-2.3 1.6-2.3 3.2V21H9.4z"
          />
        </svg>
      );
    case "threads":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path
            fill="currentColor"
            d="M12.2 22c-3 0-5.3-1-6.9-2.9C3.9 17.4 3.2 15 3.2 12s.7-5.4 2.1-7.1C6.9 3 9.2 2 12.2 2c2.3 0 4.2.6 5.7 1.8 1.4 1.1 2.4 2.6 2.9 4.6l-2.1.6c-.8-2.9-2.9-4.4-6.5-4.4-2.4 0-4.2.8-5.4 2.2-1.1 1.4-1.7 3.2-1.7 5.2s.6 3.8 1.7 5.2c1.2 1.4 3 2.2 5.4 2.2 2.1 0 3.6-.5 4.8-1.6 1.3-1.2 1.3-2.7.9-3.6-.2-.5-.7-1-1.2-1.3-.2 1.4-.6 2.5-1.4 3.3-1 1-2.3 1.5-3.9 1.5-1.2 0-2.3-.3-3.1-1-.8-.6-1.2-1.6-1.2-2.6 0-2.2 1.8-3.6 4.6-3.8 1-.1 1.9 0 2.8.1-.1-.6-.3-1.1-.7-1.4-.5-.4-1.1-.6-2-.6-1 0-1.9.4-2.4 1.1l-1.8-1.2c.9-1.3 2.3-1.9 4.2-1.9 3.1 0 4.7 1.8 4.9 5 .9.4 1.7 1 2.2 1.8.9 1.6 1 4.2-1.2 6.3C17 21.3 14.9 22 12.2 22zm.9-9.3c-1.8.1-2.7.8-2.7 1.8 0 1 .9 1.6 2.1 1.6 1.7 0 2.8-1 3-3.2-.8-.2-1.6-.3-2.4-.2z"
          />
        </svg>
      );
    case "instagram":
      return (
        <svg viewBox="0 0 24 24" {...common} fill="none">
          <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="2" />
          <circle cx="17.4" cy="6.6" r="1.2" fill="currentColor" />
        </svg>
      );
    case "youtube":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path fill="currentColor" d="M5 2.6l16.2 9.4L5 21.4z" />
        </svg>
      );
    case "tiktok":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path
            fill="currentColor"
            d="M16.6 2c.3 2.4 1.7 3.9 4 4v3.2c-1.4.1-2.7-.3-4-1.1v6.1c0 7.7-8.4 10.1-11.8 4.6-2.2-3.6-.9-9.9 6-10.1v3.4c-.5.1-1.1.2-1.6.4-1.5.5-2.4 1.5-2.2 3.2.5 3.3 6.5 4.2 6-2.2V2z"
          />
        </svg>
      );
    case "whatsapp":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path
            fill="currentColor"
            d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.6 1 2.7c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"
          />
        </svg>
      );
    case "telegram":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path
            fill="currentColor"
            d="M21.4 3.6L2.9 10.8c-1.3.5-1.2 1.2-.2 1.5l4.7 1.5 1.8 5.6c.2.6.4.8.8.8.4 0 .6-.2.9-.4l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.5c.3-1.3-.5-1.9-1.3-1.5zM9.3 13.6l9-5.7c.4-.3.8-.1.5.2l-7.4 6.7-.3 3.3z"
          />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" {...common} fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
          <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
  }
}

/* ---------------- PDF viewer toolbar ---------------- */

export function IconMenu(p: SvgProps) {
  return (
    <svg viewBox="0 0 16 16" {...p} aria-hidden="true">
      <path d="M2.2 4h11.6M2.2 8h11.6M2.2 12h11.6" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function IconMinus(p: SvgProps) {
  return (
    <svg viewBox="0 0 16 16" {...p} aria-hidden="true">
      <path d="M2.6 8h10.8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function IconPlus(p: SvgProps) {
  return (
    <svg viewBox="0 0 16 16" {...p} aria-hidden="true">
      <path d="M2.6 8h10.8M8 2.6v10.8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function IconFit(p: SvgProps) {
  return (
    <svg viewBox="0 0 16 16" {...p} aria-hidden="true" fill="none">
      <rect x="3.2" y="1.4" width="9.6" height="13.2" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6.4 5.7L8 4.1l1.6 1.6M6.4 10.3L8 11.9l1.6-1.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconRotate(p: SvgProps) {
  return (
    <svg viewBox="0 0 16 16" {...p} aria-hidden="true" fill="none">
      <path d="M1.6 9.6l3.8-3.8 3.8 3.8-3.8 3.8z" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />
      <path d="M8.2 2.5a5.6 5.6 0 0 1 5.6 6.4 5.6 5.6 0 0 1-3.4 4.4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <path d="M8.9.8L7.1 2.6l1.9 1.7" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconText(p: SvgProps) {
  return (
    <svg viewBox="0 0 18 16" {...p} aria-hidden="true">
      <path d="M1 2.2h9.2v2.4H6.9V14H4.3V4.6H1z" fill="currentColor" />
      <path d="M10.4 6.6h6.6v2h-2.1V14h-2.4V8.6h-2.1z" fill="currentColor" />
    </svg>
  );
}

export function IconDraw(p: SvgProps) {
  return (
    <svg viewBox="0 0 16 16" {...p} aria-hidden="true" fill="none">
      <path
        d="M2.4 6.4c1.2-2.6 3-4.3 4.2-3.6 1.6.9-1.4 5-2.4 7.2-.8 1.7.1 2.6 1.3 1.6l3.7-3.3c1.3-1.1 2.2-.6 1.6.8l-.9 2c-.6 1.5.5 2 1.6 1.1l1.1-.9"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconUndo(p: SvgProps) {
  return (
    <svg viewBox="0 0 16 16" {...p} aria-hidden="true" fill="none">
      <path d="M5.4 3.6L2.6 6.4l2.8 2.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 6.4h6.6a3.6 3.6 0 0 1 0 7.2H6.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function IconRedo(p: SvgProps) {
  return (
    <svg viewBox="0 0 16 16" {...p} aria-hidden="true" fill="none">
      <path d="M10.6 3.6l2.8 2.8-2.8 2.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 6.4H6.4a3.6 3.6 0 0 0 0 7.2h2.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function IconShapes(p: SvgProps) {
  return (
    <svg viewBox="0 0 18 18" {...p} aria-hidden="true" fill="none">
      <path d="M6.2 2.2h5.3l4.4 7.6M6.2 2.2L1.6 10.1l2.6 4.5h6.2M6.2 2.2l3.9 6.7" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M1.9 10.1h7.4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <path d="M14 11.4v6M11 14.4h6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function IconDownload(p: SvgProps) {
  return (
    <svg viewBox="0 0 16 16" {...p} aria-hidden="true" fill="none">
      <path d="M8 1.8v8.6M4.6 7.2L8 10.6l3.4-3.4M2.4 11.6v2.2h11.2v-2.2" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconPrint(p: SvgProps) {
  return (
    <svg viewBox="0 0 18 16" {...p} aria-hidden="true" fill="none">
      <path d="M4.6 5V1.6h8.8V5" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />
      <path
        d="M4.6 11.6H2.8a1.4 1.4 0 0 1-1.4-1.4V6.4A1.4 1.4 0 0 1 2.8 5h12.4a1.4 1.4 0 0 1 1.4 1.4v3.8a1.4 1.4 0 0 1-1.4 1.4h-1.8"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <path d="M4.6 9.2h8.8v5.4H4.6z" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />
    </svg>
  );
}

export function IconMore(p: SvgProps) {
  return (
    <svg viewBox="0 0 16 16" {...p} aria-hidden="true">
      <circle cx="8" cy="3" r="1.35" fill="currentColor" />
      <circle cx="8" cy="8" r="1.35" fill="currentColor" />
      <circle cx="8" cy="13" r="1.35" fill="currentColor" />
    </svg>
  );
}
