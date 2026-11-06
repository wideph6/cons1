"use client";

import { FileUp, ImageUp, RefreshCw, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { LinkQrPreview } from "@/components/admin/NewMQr";
import { SavedPicker, type PickerChoice } from "@/components/admin/SavedPicker";
import { useSession } from "@/components/SessionProvider";
import { Alert, Button, Field, Input, Modal, Select, errorMessage, useToast } from "@/components/ui";
import { needsApproval, type PendingEditInfo } from "@/lib/pending-shared";
import { api, ClientError } from "@/lib/client";
import { uploadNewMFile, type UploadedObject } from "@/lib/new-m-client";
import { NUMBER_EXAMPLE, NUMBER_RE, randomNumber, resolveLink, tidyNumber } from "@/lib/new-m-link";
import type { NewMDomain, NewMLists, NewMOfficer, NewMOption, NewMOptionKind, NewMRecord } from "@/lib/types";
import { fileExtension, formatBytes } from "@/lib/utils";

function todayLocalIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Officer picker values besides a saved officer's id. */
const NO_OFFICER = "";
const NEW_OFFICER = "__new";
/** The officer this document already carries, after it was removed from the saved list. */
const CURRENT_OFFICER = "__current";
/** The link this document already carries, after it was removed from its domain's links. */
const CURRENT_LINK = "__current";

interface Draft {
  domain_id: string;
  /** One of the domain's links, or CURRENT_LINK. */
  link: string;
  attestation_number: string;
  issue_date: string;
  document_type: string;
  issuing_office: string;
  issuing_authority: string;
  officer: string;
}

interface OfficerDraft {
  name: string;
  designation: string;
  signature: File | null;
  /** Object URL, so the image shows before it is uploaded anywhere. */
  preview: string | null;
}

const EMPTY_OFFICER: OfficerDraft = { name: "", designation: "", signature: null, preview: null };

/** The chosen PDF, uploading in the background from the moment it was picked. */
interface DocUpload {
  file: File;
  progress: number;
  promise: Promise<UploadedObject>;
  done: UploadedObject | null;
  error: string | null;
}

export function NewMForm({
  open,
  onClose,
  record,
  domains,
  lists,
  onSaved,
  onListsChanged,
}: {
  open: boolean;
  onClose: () => void;
  /** null = upload a new document. */
  record: NewMRecord | null;
  /** New M's own domains, each with its links. */
  domains: NewMDomain[];
  lists: NewMLists | null;
  /**
   * The saved document, as the server returned it, so the list can show it without reloading.
   * `listsChanged` says a value new to the saved lists was typed.
   */
  onSaved: (item: NewMRecord, created: boolean, listsChanged: boolean) => void;
  /** Called once a new officer is saved, so the lists everywhere pick it up. */
  onListsChanged: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const { user: me, can } = useSession();
  const editing = Boolean(record);
  /** May take saved values and officers off their lists (the super admin always may). */
  const canRemove = can("new_m_settings");
  const officerFieldId = useId();

  const [draft, setDraft] = useState<Draft>({
    domain_id: "",
    link: "",
    attestation_number: "",
    issue_date: todayLocalIso(),
    document_type: "",
    issuing_office: "",
    issuing_authority: "",
    officer: NO_OFFICER,
  });
  const [officer, setOfficer] = useState<OfficerDraft>(EMPTY_OFFICER);
  const [doc, setDoc] = useState<DocUpload | null>(null);
  /** Bumped whenever the chosen PDF changes, so a superseded upload can no longer touch the form. */
  const docSeq = useRef(0);
  /** The signature a document already carries, shown when its officer is no longer in the saved list. */
  const [currentSignature, setCurrentSignature] = useState<string | null>(null);
  /** Bumped on every open so the pickers start fresh rather than keeping the last document's state. */
  const [session, setSession] = useState(0);
  const [progress, setProgress] = useState<{ what: string; value: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const officers = lists?.officers ?? [];

  useEffect(() => {
    if (!open) return;
    setSession((s) => s + 1);
    docSeq.current++;
    setDoc(null);
    setOfficer(EMPTY_OFFICER);
    setCurrentSignature(null);
    setProgress(null);
    setError(null);

    if (record) {
      const saved = record.officer_id && officers.some((o) => o.id === record.officer_id);
      const carries = Boolean(record.officer_name || record.officer_signature_r2_key);
      const linkStillThere = domains.find((d) => d.id === record.domain_id)?.links.some((l) => l.id === record.link_id);
      setDraft({
        domain_id: record.domain_id,
        link: linkStillThere ? (record.link_id as string) : CURRENT_LINK,
        attestation_number: record.attestation_number,
        issue_date: record.issue_date.slice(0, 10),
        document_type: record.document_type,
        issuing_office: record.issuing_office,
        issuing_authority: record.issuing_authority,
        officer: saved ? (record.officer_id as string) : carries ? CURRENT_OFFICER : NO_OFFICER,
      });
      if (!saved && record.officer_signature_r2_key) {
        api<{ data_uri: string | null }>(`/api/admin/new-m/${record.id}/signature`)
          .then((r) => setCurrentSignature(r.data_uri))
          .catch(() => setCurrentSignature(null));
      }
    } else {
      // A domain that already has a link, so the usual case needs no choice at all.
      const first = domains.find((d) => d.links.length > 0) ?? domains[0];
      setDraft({
        domain_id: first?.id ?? "",
        link: first?.links[0]?.id ?? "",
        attestation_number: "",
        issue_date: todayLocalIso(),
        document_type: "",
        issuing_office: "",
        issuing_authority: "",
        officer: NO_OFFICER,
      });
    }
    // Lists are read when the dialog opens; a list refresh while it is open must not wipe what was typed.
  }, [open, record, domains]);

  // The chosen signature is previewed through an object URL, which has to be let go of.
  useEffect(() => {
    const url = officer.preview;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [officer.preview]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  /**
   * Starts uploading the PDF the moment it is chosen, so the bytes are usually in storage before Save
   * is pressed. A file chosen and then dropped stays behind in storage until the Storage page's
   * cleanup takes it, like any upload that was never attached.
   */
  function chooseDoc(file: File | null): Promise<UploadedObject> | null {
    const seq = ++docSeq.current;
    if (!file) {
      setDoc(null);
      return null;
    }
    if (fileExtension(file.name) !== "pdf") {
      setDoc(null);
      setError("Only PDF files can be uploaded.");
      return null;
    }
    const mine = (patch: Partial<DocUpload>) => {
      if (docSeq.current === seq) setDoc((d) => (d && d.file === file ? { ...d, ...patch } : d));
    };
    const promise = uploadNewMFile(file, "docs", (v) => mine({ progress: v }));
    promise.then(
      (done) => mine({ done, progress: 1, error: null }),
      (e) => mine({ error: errorMessage(e) }),
    );
    setError(null);
    setDoc({ file, progress: 0, promise, done: null, error: null });
    return promise;
  }

  const domain = useMemo(() => domains.find((d) => d.id === draft.domain_id), [domains, draft.domain_id]);
  const links = domain?.links ?? [];
  const keepsRemovedLink = Boolean(record && draft.domain_id === record.domain_id && !links.some((l) => l.id === record.link_id));
  // The link the document will be built on: a link of the domain, or the copy it already carries.
  const template =
    draft.link === CURRENT_LINK ? (record?.link_template ?? null) : (links.find((l) => l.id === draft.link)?.template ?? null);

  const number = tidyNumber(draft.attestation_number);
  const numberError = number && !NUMBER_RE.test(number) ? `Must look like ${NUMBER_EXAMPLE}: GEN, then three groups of four capital English letters.` : null;
  const issueDate = draft.issue_date || todayLocalIso();

  const previewUrl = domain && template !== null ? resolveLink(domain.hostname, template, number || "GEN-••••-••••-••••", issueDate) : "";
  // The exact complete link the server will build, once there is a valid number to put in it.
  const qrUrl = domain && template !== null && NUMBER_RE.test(number) ? resolveLink(domain.hostname, template, number, issueDate) : null;

  function pickDomain(id: string) {
    const next = domains.find((d) => d.id === id);
    const back = record && id === record.domain_id;
    setDraft((prev) => ({
      ...prev,
      domain_id: id,
      // Back on the document's own domain, its own link is the natural choice again.
      link: back && !next?.links.some((l) => l.id === record.link_id) ? CURRENT_LINK : back ? (record.link_id as string) : (next?.links[0]?.id ?? ""),
    }));
  }

  const pickedOfficer: NewMOfficer | null = officers.find((o) => o.id === draft.officer) ?? null;
  // The document carries an officer who is no longer in the saved list, so the picker must offer to keep them.
  const carriesRemovedOfficer = Boolean(
    record && (record.officer_name || record.officer_signature_r2_key) && !officers.some((o) => o.id === record.officer_id),
  );

  /** A removal the server no longer finds was already done elsewhere; anything else is said and stops it. */
  function removalFailed(e: unknown) {
    if (e instanceof ClientError && e.status === 404) return;
    toast(errorMessage(e), "danger");
    throw e;
  }

  /**
   * Takes a value off its saved list, so later uploads no longer offer it. Documents that use it keep it;
   * a value picked on this upload goes with it, unless the document being edited already carried it.
   */
  async function removeOption(kind: NewMOptionKind, o: NewMOption) {
    try {
      await api(`/api/admin/new-m/options/${o.id}`, { method: "DELETE" });
    } catch (e) {
      removalFailed(e);
    }
    toast(`“${o.value}” will no longer be suggested`);
    await onListsChanged();
    const same = (v: string | null | undefined) => (v ?? "").trim().toLowerCase() === o.value.toLowerCase();
    setDraft((d) => (same(d[kind]) && !same(record?.[kind]) ? { ...d, [kind]: "" } : d));
  }

  /**
   * Takes an officer off the saved list. Documents given this officer keep their own copy of the name,
   * designation and signature, so the document being edited keeps them too, as saved on it.
   */
  async function removeOfficer(o: NewMOfficer) {
    try {
      await api(`/api/admin/new-m/officers/${o.id}`, { method: "DELETE" });
    } catch (e) {
      removalFailed(e);
    }
    toast(`${o.name || "The officer"} will no longer be suggested`);
    await onListsChanged();
    if (record && record.officer_id === o.id) {
      setDraft((d) => (d.officer === o.id ? { ...d, officer: CURRENT_OFFICER } : d));
      if (record.officer_signature_r2_key) {
        api<{ data_uri: string | null }>(`/api/admin/new-m/${record.id}/signature`)
          .then((r) => setCurrentSignature(r.data_uri))
          .catch(() => setCurrentSignature(null));
      }
    } else {
      setDraft((d) => (d.officer === o.id ? { ...d, officer: NO_OFFICER } : d));
    }
  }

  const officerChoices: PickerChoice[] = [
    { value: NO_OFFICER, text: "— no officer —", kind: "none" },
    ...(carriesRemovedOfficer
      ? [{ value: CURRENT_OFFICER, text: `${record?.officer_name || "Unnamed"} (as saved on this document)`, kind: "kept" as const }]
      : []),
    ...officers.map((o) => ({
      value: o.id,
      text: o.name,
      detail: o.designation || undefined,
      remove: canRemove ? () => removeOfficer(o) : undefined,
    })),
    { value: NEW_OFFICER, text: "+ Add a new officer…", kind: "add" },
  ];

  async function save() {
    setError(null);
    if (!draft.domain_id) return setError("Pick the domain the link should be built on.");
    if (template === null) {
      return setError(
        links.length ? "Pick the link the document should use." : "This domain has no links yet. Add one under Domains & links.",
      );
    }
    if (!editing && !doc) return setError("Choose the PDF to upload.");
    if (numberError) return setError(numberError);
    if (editing && !number) return setError("Enter the attestation number, or press Generate for a new one.");
    if (draft.officer === NEW_OFFICER && !officer.name.trim()) return setError("Enter the approving officer's name.");

    setBusy(true);
    try {
      // The officer is saved first. Should the document fail afterwards, the officer is already in the
      // list and stays picked, so trying again does not save them twice.
      let officerId: string | null | undefined;
      if (draft.officer === NEW_OFFICER) {
        let signature: { key: string; content_type: string } | null = null;
        if (officer.signature) {
          const file = officer.signature;
          setProgress({ what: file.name, value: 0 });
          signature = await uploadNewMFile(file, "signatures", (v) => setProgress({ what: file.name, value: v }));
          setProgress(null);
        }
        const r = await api<{ item: NewMOfficer }>("/api/admin/new-m/officers", {
          json: {
            name: officer.name,
            designation: officer.designation,
            signature_key: signature?.key,
            signature_content_type: signature?.content_type,
          },
        });
        officerId = r.item.id;
        // The lists refresh in the background; the document save does not wait for them.
        void onListsChanged();
        set("officer", r.item.id);
        setOfficer(EMPTY_OFFICER);
      } else if (draft.officer === CURRENT_OFFICER) {
        officerId = undefined;
      } else {
        officerId = draft.officer || null;
      }

      // The PDF has been uploading since it was chosen; this only waits for whatever is left. One that
      // failed is tried once more here.
      let upload: UploadedObject | null = null;
      if (doc) {
        upload = doc.done ?? (await (doc.error ? chooseDoc(doc.file) : doc.promise));
      }

      const payload: Record<string, unknown> = {
        domain_id: draft.domain_id,
        // Left out to keep the link the document already carries.
        ...(draft.link === CURRENT_LINK ? {} : { link_id: draft.link }),
        attestation_number: number,
        issue_date: draft.issue_date || todayLocalIso(),
        document_type: draft.document_type,
        issuing_office: draft.issuing_office,
        issuing_authority: draft.issuing_authority,
      };
      if (officerId !== undefined) payload.officer_id = officerId;
      if (upload) {
        payload.doc_key = upload.key;
        payload.doc_filename = upload.filename;
        payload.doc_content_type = upload.content_type;
      }

      // A value typed in that no saved list has yet: the lists need a refresh to offer it next time.
      const listsChanged = (["document_type", "issuing_office", "issuing_authority"] as const).some((kind) => {
        const value = draft[kind].trim().toLowerCase();
        return value !== "" && !(lists?.options[kind] ?? []).some((o) => o.value.toLowerCase() === value);
      });

      const r = editing && record
        ? await api<{ item: NewMRecord; pending?: PendingEditInfo | null }>(`/api/admin/new-m/${record.id}`, { method: "PATCH", json: payload })
        : await api<{ item: NewMRecord; pending?: PendingEditInfo | null }>("/api/admin/new-m", { json: payload });
      toast(
        r.pending
          ? `${r.item.attestation_number}: change sent for approval. It goes live once the super admin approves it.`
          : `${r.item.attestation_number} ${editing ? "updated" : "uploaded"}`,
      );
      // The list takes the saved document as returned, so the form closes without waiting for a reload.
      onSaved(r.item, !editing, listsChanged);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setProgress(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={editing ? `Edit ${record?.attestation_number}` : "Upload a document"}
      width="max-w-3xl"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            {editing ? "Save changes" : "Upload document"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {record?.pending_edit ? (
          <Alert tone="warn">
            A change to this document is already waiting for the super admin&apos;s approval. Another one can be sent once it is
            approved or turned down.
          </Alert>
        ) : record && needsApproval(me.role, record.created_at) ? (
          <Alert tone="info">
            This document was uploaded more than a month ago, so your changes (and a replaced PDF) go live only after the super
            admin approves them. Until then the verification page shows it as it is now.
          </Alert>
        ) : null}
        {domains.length === 0 ? (
          <Alert tone="warn">Add a domain first, under Domains &amp; links — the verification link is built on it.</Alert>
        ) : null}

        <Field
          label={editing ? "Replace PDF" : "PDF"}
          hint={
            editing
              ? `Currently ${record?.doc_filename} (${formatBytes(record?.doc_size)}). Choosing a file removes it and puts the new one in its place.`
              : "One document per upload. It starts uploading as soon as it is chosen, while you fill in the rest."
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex">
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  chooseDoc(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
              <span className="inline-flex items-center gap-2 h-9 px-3.5 rounded-md border border-line-strong bg-surface text-sm font-medium cursor-pointer hover:bg-surface-2">
                <FileUp className="size-4" />
                Choose PDF
              </span>
            </label>
            {doc ? (
              <span className="text-[13px] text-text-muted inline-flex items-center gap-1.5">
                {doc.file.name} · {formatBytes(doc.file.size)}
                {doc.done ? (
                  <span className="text-ok-600">· uploaded</span>
                ) : doc.error ? null : (
                  <span className="tabular-nums">· uploading {Math.round(doc.progress * 100)}%</span>
                )}
                <button type="button" onClick={() => chooseDoc(null)} disabled={busy} aria-label="Clear chosen PDF">
                  <X className="size-3.5" />
                </button>
              </span>
            ) : null}
          </div>
          {doc && !doc.done && !doc.error ? (
            <div className="h-1 rounded bg-surface-2 overflow-hidden mt-1.5">
              <div className="h-full bg-teal-600 transition-all" style={{ width: `${Math.round(doc.progress * 100)}%` }} />
            </div>
          ) : null}
          {doc?.error ? (
            <p className="text-[12.5px] text-danger-600 mt-1">{doc.error} — it is tried again when you save.</p>
          ) : null}
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Domain" hint="One of New M's own domains or subdomains.">
            <Select value={draft.domain_id} disabled={busy} onChange={(e) => pickDomain(e.target.value)}>
              {domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.hostname}
                  {d.links.length ? "" : " (no links yet)"}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Link"
            hint={links.length || keepsRemovedLink ? "The domain's link this document is built on." : "This domain has no links yet. Add one under Domains & links."}
          >
            <Select value={draft.link} disabled={busy || (!links.length && !keepsRemovedLink)} onChange={(e) => set("link", e.target.value)}>
              {!links.length && !keepsRemovedLink ? <option value="">— no links —</option> : null}
              {keepsRemovedLink ? <option value={CURRENT_LINK}>As saved on this document (link removed)</option> : null}
              {links.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name || "Untitled link"} — {l.template}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Date of attestation" hint="Left empty, today's date is used. Fills the date formula as DDMMYYYY.">
            <Input type="date" value={draft.issue_date} disabled={busy} onChange={(e) => set("issue_date", e.target.value)} />
          </Field>
        </div>

        <Field
          label="Attestation number"
          error={numberError}
          hint={
            editing
              ? "Fills the attestation-number formula, so changing it changes the link."
              : `Left empty, one is generated, e.g. ${NUMBER_EXAMPLE}. Must be unique across all domains.`
          }
        >
          <div className="flex gap-2">
            <Input
              value={draft.attestation_number}
              disabled={busy}
              invalid={Boolean(numberError)}
              placeholder={editing ? "" : "GEN-••••-••••-••••  (auto)"}
              className="font-mono"
              onChange={(e) => set("attestation_number", e.target.value.toUpperCase())}
            />
            <Button
              icon={<RefreshCw className="size-4" />}
              disabled={busy}
              onClick={() => set("attestation_number", randomNumber())}
              title="Fill in a new random number"
            >
              Generate
            </Button>
          </div>
        </Field>

        {previewUrl ? (
          <div className="rounded-md border bg-surface-2 px-3 py-2 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11.5px] text-text-muted mb-0.5">Complete link — this is what the QR code holds</div>
              <div className="font-mono text-[12.5px] break-all">{previewUrl}</div>
              <div className="text-[11.5px] text-text-muted mt-1.5">
                {!qrUrl
                  ? "The QR code appears once the number is set — press Generate, or it is made and saved when the document is uploaded."
                  : !editing
                    ? "Preview of the QR code. It is saved with the document when you upload."
                    : qrUrl !== record?.qr_url
                      ? "The link has changed: saving replaces the stored QR code with this new one."
                      : "This is the QR code saved with the document."}
              </div>
            </div>
            {qrUrl ? <LinkQrPreview url={qrUrl} alt="QR code for this link" className="size-24 shrink-0 border rounded" /> : null}
          </div>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <OptionField
            key={`document_type-${session}`}
            label="Document type"
            value={draft.document_type}
            options={lists?.options.document_type ?? []}
            disabled={busy}
            onChange={(v) => set("document_type", v)}
            onRemove={canRemove ? (o) => removeOption("document_type", o) : undefined}
          />
          <OptionField
            key={`issuing_office-${session}`}
            label="Issuing office"
            value={draft.issuing_office}
            options={lists?.options.issuing_office ?? []}
            disabled={busy}
            onChange={(v) => set("issuing_office", v)}
            onRemove={canRemove ? (o) => removeOption("issuing_office", o) : undefined}
          />
          <OptionField
            key={`issuing_authority-${session}`}
            label="Issuing authority"
            value={draft.issuing_authority}
            options={lists?.options.issuing_authority ?? []}
            disabled={busy}
            onChange={(v) => set("issuing_authority", v)}
            onRemove={canRemove ? (o) => removeOption("issuing_authority", o) : undefined}
          />
        </div>

        <div className="rounded-md border p-3 space-y-3">
          <Field
            label="Approving officer"
            htmlFor={officerFieldId}
            hint={
              officers.length
                ? "Picking a saved officer fills in their designation and signature too."
                : "No officers saved yet. Choose “Add a new officer” to save the first one."
            }
          >
            <SavedPicker
              key={session}
              id={officerFieldId}
              value={draft.officer}
              choices={officerChoices}
              disabled={busy}
              onChange={(v) => set("officer", v)}
              removeNote="Documents already given this officer keep their name, designation and signature."
            />
          </Field>

          {pickedOfficer ? (
            <OfficerSummary name={pickedOfficer.name} designation={pickedOfficer.designation} signature={pickedOfficer.signature_url} />
          ) : null}
          {draft.officer === CURRENT_OFFICER && record ? (
            <OfficerSummary
              name={record.officer_name}
              designation={record.officer_designation}
              signature={currentSignature}
              note="This officer was removed from the saved list. The document keeps them until you pick another."
            />
          ) : null}

          {draft.officer === NEW_OFFICER ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Approving officer name">
                <Input value={officer.name} disabled={busy} onChange={(e) => setOfficer((o) => ({ ...o, name: e.target.value }))} />
              </Field>
              <Field label="Approving officer designation">
                <Input
                  value={officer.designation}
                  disabled={busy}
                  onChange={(e) => setOfficer((o) => ({ ...o, designation: e.target.value }))}
                />
              </Field>
              <Field
                label="Approving officer signature"
                hint="PNG with a transparent background works best. Saved with the officer for every later upload."
                className="sm:col-span-2"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="sr-only"
                      disabled={busy}
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        e.target.value = "";
                        setOfficer((o) => ({ ...o, signature: file, preview: file ? URL.createObjectURL(file) : null }));
                      }}
                    />
                    <span className="inline-flex items-center gap-2 h-9 px-3.5 rounded-md border border-line-strong bg-surface text-sm font-medium cursor-pointer hover:bg-surface-2">
                      <ImageUp className="size-4" />
                      Choose image
                    </span>
                  </label>
                  {officer.preview ? (
                    <span className="inline-flex items-center gap-2">
                      <img src={officer.preview} alt="Chosen signature" className="h-12 max-w-48 object-contain border rounded bg-white p-1" />
                      <button
                        type="button"
                        onClick={() => setOfficer((o) => ({ ...o, signature: null, preview: null }))}
                        disabled={busy}
                        aria-label="Clear chosen signature"
                      >
                        <X className="size-3.5" />
                      </button>
                    </span>
                  ) : null}
                </div>
              </Field>
            </div>
          ) : null}
        </div>

        {progress ? (
          <div>
            <div className="text-[12.5px] text-text-muted mb-1">
              Uploading {progress.what} — {Math.round(progress.value * 100)}%
            </div>
            <div className="h-1.5 rounded bg-surface-2 overflow-hidden">
              <div className="h-full bg-teal-600 transition-all" style={{ width: `${Math.round(progress.value * 100)}%` }} />
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function OfficerSummary({
  name,
  designation,
  signature,
  note,
}: {
  name: string;
  designation: string;
  signature: string | null;
  note?: string;
}) {
  return (
    <div className="rounded-md bg-surface-2 border px-3 py-2 flex flex-wrap items-center gap-4">
      <div className="min-w-0 flex-1 text-[13px]">
        <div className="font-medium">{name || "Unnamed"}</div>
        <div className="text-text-muted">{designation || "No designation"}</div>
        {note ? <div className="text-[12px] text-warn-600 mt-1">{note}</div> : null}
      </div>
      {signature ? (
        <img src={signature} alt={`Signature of ${name}`} className="h-12 max-w-48 object-contain border rounded bg-white p-1" />
      ) : (
        <span className="text-[12px] text-text-faint">No signature</span>
      )}
    </div>
  );
}

const ADD_NEW = "__new";

/**
 * A field that offers every value saved so far and lets a new one be typed. A new value joins the
 * saved list when the document is saved, so it can be picked on every later upload. With `onRemove`,
 * each saved value has a bin beside it that stops it being offered again.
 */
function OptionField({
  label,
  value,
  options,
  disabled,
  onChange,
  onRemove,
}: {
  label: string;
  value: string;
  options: NewMOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
  onRemove?: (option: NewMOption) => Promise<void>;
}) {
  const id = useId();
  const saved = options.find((o) => o.value.toLowerCase() === value.trim().toLowerCase());
  // Typing when there is nothing to pick from yet; otherwise picking, with "add new" one choice away.
  const [typing, setTyping] = useState(options.length === 0);

  if (typing || options.length === 0) {
    return (
      <Field
        label={label}
        hint={
          options.length ? (
            <button
              type="button"
              className="text-teal-700 hover:underline"
              disabled={disabled}
              onClick={() => {
                setTyping(false);
                if (!saved) onChange("");
              }}
            >
              Pick from the saved list instead
            </button>
          ) : (
            "Saved for every later upload."
          )
        }
      >
        <Input value={value} disabled={disabled} autoFocus={options.length > 0} onChange={(e) => onChange(e.target.value)} />
      </Field>
    );
  }

  const choices: PickerChoice[] = [
    { value: "", text: "— none —", kind: "none" },
    // A value this document carries that has since been removed from the saved list.
    ...(value && !saved ? [{ value, text: `${value} (not in saved list)`, kind: "kept" as const }] : []),
    ...options.map((o) => ({ value: o.value, text: o.value, remove: onRemove ? () => onRemove(o) : undefined })),
    { value: ADD_NEW, text: "+ Add new…", kind: "add" },
  ];

  return (
    <Field label={label} htmlFor={id}>
      <SavedPicker
        id={id}
        value={saved ? saved.value : value}
        choices={choices}
        disabled={disabled}
        onChange={(v) => {
          if (v === ADD_NEW) {
            setTyping(true);
            onChange("");
          } else {
            onChange(v);
          }
        }}
        removeNote="Documents that already use it keep it."
      />
    </Field>
  );
}
