import type { PendingEditInfo } from "./pending-shared";

/* ---------------- Appo ---------------- */

/**
 * One of an Appo domain's links: everything after the domain, with {attestation_number} and
 * {issue_date} where each document's own values go.
 */
export interface AppoLink {
  id: string;
  domain_id: string;
  name: string;
  template: string;
  created_at: string;
  updated_at: string;
  /** Documents built on this link; their links and QR codes follow it. */
  document_count: number;
}

/** A domain or subdomain set up for Appo alone, apart from the Domains page. */
export interface AppoDomain {
  id: string;
  hostname: string;
  notes: string;
  created_at: string;
  links: AppoLink[];
  document_count: number;
}

/** The lists an upload can pick from, each growing with every new value typed in. */
export type AppoOptionKind = "document_type" | "signed_by" | "signed_capacity" | "seal_stamp" | "office_city" | "office_name";

/**
 * The values typed into each upload, in the order the verification record shows them, with the name
 * the admin panel gives each and its saved list's heading.
 */
export const APPO_FIELDS: Array<{ kind: AppoOptionKind; label: string; list: string }> = [
  { kind: "document_type", label: "Document type", list: "Document types" },
  { kind: "signed_by", label: "Previously signed by", list: "Previously signed by" },
  { kind: "signed_capacity", label: "Previous signed acting in capacity", list: "Acting in capacity" },
  { kind: "seal_stamp", label: "Bears the seal or stamp", list: "Seals or stamps" },
  { kind: "office_city", label: "Office city", list: "Office cities" },
  { kind: "office_name", label: "Office name", list: "Office names" },
];

export interface AppoOption {
  id: string;
  kind: AppoOptionKind;
  value: string;
}

/** A saved approving officer: picking one fills in the name, designation and signature together. */
export interface AppoOfficer {
  id: string;
  name: string;
  designation: string;
  signature_r2_key: string | null;
  signature_content_type: string | null;
  /** Short-lived link to the signature image, for showing it in the panel. */
  signature_url: string | null;
}

export interface AppoLists {
  options: Record<AppoOptionKind, AppoOption[]>;
  officers: AppoOfficer[];
  /** The three capital letters every new attestation number starts with (APN unless the super admin changed it). */
  number_prefix: string;
}

/**
 * One uploaded attestation document. Everything a sticker will print is on the record itself, so a
 * sticker drawn at download time always matches the record as it reads now, edits included.
 */
export interface AppoRecord {
  id: string;
  /** An Appo domain, not one from the Domains page. */
  domain_id: string;
  /** The domain link the document is built on, or null once that link was removed. */
  link_id: string | null;
  /** Copy of the link last used to build the document's address, for when the link is removed. */
  link_template: string;
  attestation_number: string;
  /** ISO date (YYYY-MM-DD); the link carries it as DDMMYYYY. */
  issue_date: string;
  document_type: string;
  /** 2 — Previously signed by. */
  signed_by: string;
  /** 3 — Previous Signed acting in capacity. */
  signed_capacity: string;
  /** 4 — Bears the seal or stamp. */
  seal_stamp: string;
  /** 5 — Office City. */
  office_city: string;
  /** 7 — Office Name. */
  office_name: string;
  /** The saved officer this document was given, or null when none was picked or it was removed from the list. */
  officer_id: string | null;
  /** Copied from that officer, so removing them from the list leaves this document unchanged. */
  officer_name: string;
  officer_designation: string;
  officer_signature_r2_key: string | null;
  officer_signature_content_type: string | null;
  doc_filename: string;
  doc_r2_key: string;
  doc_size: number;
  doc_content_type: string;
  doc_uploaded_at: string;
  doc_replaced_at: string | null;
  /** The link the saved QR code was drawn from. */
  qr_url: string | null;
  /** The saved QR code, a standalone SVG. Replaced whenever an edit changes the link. */
  qr_svg: string | null;
  qr_updated_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  domain_hostname: string;
  /** Name and current wording of the domain link; null once that link was removed. */
  link_name: string | null;
  link_current_template: string | null;
  uploader_name: string | null;
  uploader_email: string | null;
  /** The complete link, built by the server from the domain, its link and the document's values. */
  verify_url: string;
  /** Earlier PDFs still kept after a replace, for the super admin to compare (15 days each). */
  previous_files?: number;
  /** An edit waiting for the super admin's approval (documents uploaded more than a month ago). */
  pending_edit?: PendingEditInfo | null;
}
