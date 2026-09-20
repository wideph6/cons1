"use client";

import { FileUp, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  ApposttaRecordFields,
  rowsFromDefs,
  rowsFromRecord,
  type RowSpec,
} from "@/components/admin/ApposttaRecordFields";
import { Alert, Button, Field, Input, Modal, Select, Textarea, errorMessage, useToast } from "@/components/ui";
import { api } from "@/lib/client";
import { uploadApposttaFile } from "@/lib/appostta-client";
import type { ApposttaRecord, ApposttaSettings, Domain } from "@/lib/types";
import { formatBytes } from "@/lib/utils";

function todayLocalIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

interface Draft {
  domain_id: string;
  number: string;
  issued_on: string;
  /** One value per row, in the order the rows are shown. */
  values: string[];
  signature_id: string;
  notes: string;
}

export function ApposttaForm({
  open,
  onClose,
  record,
  domains,
  settings,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** null = create a new record. */
  record: ApposttaRecord | null;
  domains: Domain[];
  settings: ApposttaSettings | null;
  onSaved: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const editing = Boolean(record);

  const [draft, setDraft] = useState<Draft>({
    domain_id: "",
    number: "",
    issued_on: todayLocalIso(),
    values: [],
    signature_id: "",
    notes: "",
  });
  /**
   * The rows themselves, which this form never edits. A new record takes them from the settings
   * definitions; an existing one keeps the rows it was created with.
   */
  const [rows, setRows] = useState<RowSpec[]>([]);
  const [doc, setDoc] = useState<File | null>(null);
  const [progress, setProgress] = useState<{ what: string; value: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDoc(null);
    setProgress(null);
    setError(null);

    const defs = settings?.field_defs ?? [];
    if (record) {
      const built = rowsFromRecord(record.fields, defs);
      setRows(built.rows);
      setDraft({
        domain_id: record.domain_id,
        number: record.number,
        issued_on: record.issued_on.slice(0, 10),
        values: built.values,
        signature_id: record.signature_id,
        notes: record.notes,
      });
    } else {
      const built = rowsFromDefs(defs);
      setRows(built.rows);
      setDraft({
        domain_id: domains[0]?.id ?? "",
        number: "",
        issued_on: todayLocalIso(),
        values: built.values,
        // Whichever signature the settings preselect, so the usual case needs no choice at all.
        signature_id: settings?.default_signature_id || settings?.signatures[0]?.id || "",
        notes: "",
      });
    }
  }, [open, record, domains, settings]);

  const domain = useMemo(() => domains.find((d) => d.id === draft.domain_id), [domains, draft.domain_id]);

  // Shown unescaped so it reads like the finished link. Built by hand rather than round-tripping a
  // URLSearchParams through decodeURIComponent, which throws on a stray % while the field is typed.
  const previewUrl = useMemo(() => {
    if (!domain) return "";
    const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(draft.issued_on);
    const number = draft.number.trim().toUpperCase() || `${settings?.number_prefix ?? "APT"}-••••-••••-••••`;
    return `https://${domain.hostname}/verify-appostta?number=${number}&day=${d?.[3] ?? ""}&month=${d?.[2] ?? ""}&year=${d?.[1] ?? ""}`;
  }, [domain, draft.issued_on, draft.number, settings]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  /** Sent as id + value; the labels live in settings and are never round-tripped through the client. */
  const fieldValues = useMemo(
    () => rows.map((row, i) => ({ id: row.id, value: draft.values[i] ?? "" })),
    [rows, draft.values],
  );

  async function save() {
    setError(null);
    if (!draft.domain_id) {
      setError("Pick the domain the link should be built on.");
      return;
    }
    if (!editing && !doc) {
      setError("Choose the document to upload.");
      return;
    }

    setBusy(true);
    try {
      let docUpload: { key: string; filename: string; content_type: string } | null = null;
      if (doc) {
        setProgress({ what: doc.name, value: 0 });
        docUpload = await uploadApposttaFile(doc, "docs", (v) => setProgress({ what: doc.name, value: v }));
      }
      setProgress(null);

      const payload: Record<string, unknown> = {
        domain_id: draft.domain_id,
        issued_on: draft.issued_on,
        field_values: fieldValues,
        signature_id: draft.signature_id,
        notes: draft.notes,
      };
      if (draft.number.trim()) payload.number = draft.number.trim();
      if (docUpload) {
        payload.doc_key = docUpload.key;
        payload.doc_filename = docUpload.filename;
        payload.doc_content_type = docUpload.content_type;
      }

      if (editing && record) {
        await api(`/api/admin/appostta/${record.id}`, { method: "PATCH", json: payload });
        toast(`${record.number} updated`);
      } else {
        const r = await api<{ item: ApposttaRecord }>("/api/admin/appostta", { json: payload });
        toast(`${r.item.number} created`);
      }
      await onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setProgress(null);
    } finally {
      setBusy(false);
    }
  }

  const signatures = settings?.signatures ?? [];
  // A signature this record was issued under that has since been dropped from settings. It still
  // prints, so the picker has to be able to say so rather than silently showing a different name.
  const goneSignature =
    editing && record?.signature_id && !signatures.some((s) => s.id === record.signature_id) ? record : null;

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={editing ? `Edit ${record?.number}` : "New Appostta record"}
      width="max-w-3xl"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            {editing ? "Save changes" : "Create record"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {domains.length === 0 ? (
          <Alert tone="warn">Add a domain first — the verification link is built on one of your domains.</Alert>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Domain" hint="The link and QR code are built on this domain.">
            <Select value={draft.domain_id} disabled={busy} onChange={(e) => set("domain_id", e.target.value)}>
              {domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.hostname}
                  {d.is_active ? "" : " (disabled)"}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Issue date" hint="Goes into the link as day, month and year. Editable later.">
            <Input type="date" value={draft.issued_on} disabled={busy} onChange={(e) => set("issued_on", e.target.value)} />
          </Field>
        </div>

        <Field
          label="Reference number"
          hint={
            editing
              ? "Changing this changes the verification link."
              : `Leave blank to generate one automatically, e.g. ${settings?.number_prefix ?? "APT"}-MUBN-NGDW-EGCW.`
          }
        >
          <div className="flex gap-2">
            <Input
              value={draft.number}
              disabled={busy}
              placeholder={editing ? "" : `${settings?.number_prefix ?? "APT"}-••••-••••-••••  (auto)`}
              className="font-mono"
              onChange={(e) => set("number", e.target.value.toUpperCase())}
            />
            {editing ? null : (
              <Button
                icon={<RefreshCw className="size-4" />}
                disabled={busy}
                onClick={() => set("number", "")}
                title="Clear so a new number is generated on save"
              >
                Auto
              </Button>
            )}
          </div>
        </Field>

        {previewUrl ? (
          <div className="rounded-md border bg-surface-2 px-3 py-2">
            <div className="text-[11.5px] text-text-muted mb-0.5">Verification link</div>
            <div className="font-mono text-[12.5px] break-all">{previewUrl}</div>
          </div>
        ) : null}

        <Field
          label={editing ? "Replace document" : "Document"}
          hint={
            editing
              ? record?.doc_filename
                ? `Currently ${record.doc_filename} (${formatBytes(record.doc_size)}). Choosing a file replaces it.`
                : "No document attached yet."
              : "Stored in R2. This is the file the verification link hands over."
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex">
              <input
                type="file"
                className="sr-only"
                disabled={busy}
                onChange={(e) => setDoc(e.target.files?.[0] ?? null)}
              />
              <span className="inline-flex items-center gap-2 h-9 px-3.5 rounded-md border border-line-strong bg-surface text-sm font-medium cursor-pointer hover:bg-surface-2">
                <FileUp className="size-4" />
                Choose file
              </span>
            </label>
            {doc ? (
              <span className="text-[13px] text-text-muted inline-flex items-center gap-1.5">
                {doc.name} · {formatBytes(doc.size)}
                <button type="button" onClick={() => setDoc(null)} disabled={busy} aria-label="Clear chosen document">
                  <X className="size-3.5" />
                </button>
              </span>
            ) : null}
          </div>
        </Field>

        <Field
          label="Certificate rows"
          hint={
            editing
              ? "These are the rows this record was created with. They stay as they are even after the settings change."
              : "Set in Appostta settings. Fill in the values for this record."
          }
        >
          <ApposttaRecordFields
            // Remounted per record so one record's "type a custom value" state never carries to the next.
            key={record?.id ?? "new"}
            rows={rows}
            values={draft.values}
            disabled={busy}
            onChange={(v) => set("values", v)}
          />
        </Field>

        <Field
          label="Signature"
          hint={
            signatures.length
              ? "Pick the person this record is issued under. The choice is copied onto the record."
              : "No signatures set up yet. Add them in Appostta settings."
          }
        >
          <Select
            value={draft.signature_id}
            disabled={busy || (signatures.length === 0 && !goneSignature)}
            onChange={(e) => set("signature_id", e.target.value)}
          >
            <option value="">— no signature —</option>
            {goneSignature ? (
              <option value={goneSignature.signature_id}>
                {goneSignature.signatory_name || "Unnamed"} (removed from settings)
              </option>
            ) : null}
            {signatures.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Notes" hint="Internal only — never shown on the certificate or the public page.">
          <Textarea value={draft.notes} disabled={busy} onChange={(e) => set("notes", e.target.value)} />
        </Field>

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
