"use client";

import { useEffect, useRef, useState } from "react";
import { ApposttaFieldDefs } from "@/components/admin/ApposttaFieldDefs";
import { ApposttaSignatures, type PendingSignature } from "@/components/admin/ApposttaSignatures";
import { Alert, Button, Field, Input, Modal, Select, Textarea, errorMessage, useToast } from "@/components/ui";
import { api } from "@/lib/client";
import { uploadApposttaFile } from "@/lib/appostta-client";
import { TOKEN_HELP } from "@/lib/certificate";
import type { ApposttaFieldDef, ApposttaSettings, ApposttaSignature } from "@/lib/types";

interface SettingsResponse {
  settings: ApposttaSettings;
  /** Already-stored signature images, keyed by signature id. */
  signature_data_uris: Record<string, string>;
}

/**
 * Panel-wide defaults: the certificate rows every new record starts with, and the signatures a
 * record can be issued under. Records created earlier keep the rows and signature they were given.
 */
export function ApposttaSettingsForm({
  open,
  onClose,
  canEdit,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  canEdit: boolean;
  onSaved: (settings: ApposttaSettings) => void;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [draft, setDraft] = useState<ApposttaSettings | null>(null);
  /** Signature images chosen here but not uploaded until the settings are saved. */
  const [pending, setPending] = useState<Record<string, PendingSignature>>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setData(null);
    setDraft(null);
    setPending({});
    api<SettingsResponse>("/api/admin/appostta/settings")
      .then((r) => {
        setData(r);
        setDraft(r.settings);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [open]);

  // Each chosen file holds an object URL. They are released one by one as they are replaced and, for
  // whatever is still open, when the form goes away — reading through a ref so releasing them is not
  // tied to a render, which would revoke previews that are still on screen.
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(() => {
    return () => {
      for (const p of Object.values(pendingRef.current)) URL.revokeObjectURL(p.preview);
    };
  }, []);

  function set<K extends keyof ApposttaSettings>(key: K, value: ApposttaSettings[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function setPendingFor(id: string, next: PendingSignature | null) {
    setPending((prev) => {
      const copy = { ...prev };
      const old = copy[id];
      if (old) URL.revokeObjectURL(old.preview);
      if (next) copy[id] = next;
      else delete copy[id];
      return copy;
    });
  }

  async function save() {
    if (!draft) return;
    setError(null);

    const unnamed = draft.signatures.find((s) => !s.name.trim());
    if (unnamed) {
      setError("Every signature needs the name that is printed under it.");
      return;
    }
    const imageless = draft.signatures.find((s) => !s.r2_key && !pending[s.id]);
    if (imageless) {
      setError(`Upload an image for the signature "${imageless.name}".`);
      return;
    }

    setBusy(true);
    try {
      // Uploaded only now, so a signature the admin added and then removed never reaches storage.
      let signatures: ApposttaSignature[] = draft.signatures;
      const toUpload = draft.signatures.filter((s) => pending[s.id]);
      if (toUpload.length) {
        setUploading(true);
        const uploaded = await Promise.all(
          toUpload.map(async (s) => {
            const up = await uploadApposttaFile(pending[s.id]!.file, "signatures");
            return [s.id, up] as const;
          }),
        );
        const byId = new Map(uploaded);
        signatures = draft.signatures.map((s) => {
          const up = byId.get(s.id);
          return up ? { ...s, r2_key: up.key, content_type: up.content_type } : s;
        });
        setUploading(false);
      }

      const r = await api<{ settings: ApposttaSettings }>("/api/admin/appostta/settings", {
        method: "PATCH",
        json: {
          org_name: draft.org_name,
          org_tagline: draft.org_tagline,
          number_prefix: draft.number_prefix,
          field_defs: draft.field_defs,
          signatures,
          default_signature_id: draft.default_signature_id,
          footer_note: draft.footer_note,
          watermark_text: draft.watermark_text,
          stamp_text: draft.stamp_text,
          stamp_after_row: draft.stamp_after_row,
          verify_note: draft.verify_note,
        },
      });
      toast("Appostta settings saved");
      onSaved(r.settings);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="Appostta settings"
      width="max-w-2xl"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {canEdit ? "Cancel" : "Close"}
          </Button>
          {canEdit ? (
            <Button variant="primary" loading={busy} disabled={!draft} onClick={save}>
              Save settings
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {!canEdit ? <Alert tone="info">You can view these settings but not change them.</Alert> : null}
        {!draft && !error ? <p className="text-text-muted text-sm">Loading…</p> : null}

        {draft ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Organisation name" hint="Printed as the heading of every certificate.">
                <Input
                  value={draft.org_name}
                  disabled={!canEdit || busy}
                  placeholder="Your organisation"
                  onChange={(e) => set("org_name", e.target.value)}
                />
              </Field>
              <Field label="Tagline" hint="Optional line under the name.">
                <Input
                  value={draft.org_tagline}
                  disabled={!canEdit || busy}
                  onChange={(e) => set("org_tagline", e.target.value)}
                />
              </Field>
            </div>

            <Field
              label="Number prefix"
              hint={`New numbers look like ${(draft.number_prefix || "APT").toUpperCase()}-MUBN-NGDW-EGCW.`}
            >
              <Input
                value={draft.number_prefix}
                disabled={!canEdit || busy}
                className="font-mono w-40"
                onChange={(e) => set("number_prefix", e.target.value.toUpperCase())}
              />
            </Field>

            <Field
              label="Certificate rows"
              hint="Set the rows here once. Every record created afterwards carries exactly these rows and only picks the values. Records created earlier keep the rows they already have."
            >
              <ApposttaFieldDefs
                value={draft.field_defs}
                disabled={!canEdit || busy}
                onChange={(f: ApposttaFieldDef[]) => set("field_defs", f)}
              />
            </Field>

            <Field
              label="Signatures"
              hint="Add every signature you issue under. A new record picks one by name instead of uploading an image."
            >
              <ApposttaSignatures
                value={draft.signatures}
                onChange={(s) => set("signatures", s)}
                dataUris={data?.signature_data_uris ?? {}}
                pending={pending}
                onPending={setPendingFor}
                defaultId={draft.default_signature_id}
                onDefault={(id) => set("default_signature_id", id)}
                disabled={!canEdit || busy}
                busy={uploading}
              />
            </Field>

            <Field
              label="Background watermark"
              hint="Repeated faintly across the whole certificate. Leave empty for a plain background."
            >
              <Input
                value={draft.watermark_text}
                disabled={!canEdit || busy}
                placeholder="Your organisation's name"
                onChange={(e) => set("watermark_text", e.target.value)}
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3">
              <Field
                label="Certification mark"
                hint="Printed in italic across the certificate, for example “Certified”. Leave empty for none."
              >
                <Input
                  value={draft.stamp_text}
                  disabled={!canEdit || busy}
                  onChange={(e) => set("stamp_text", e.target.value)}
                />
              </Field>

              <Field label="Printed after row" hint="Where it sits among the rows.">
                <Select
                  value={String(draft.stamp_after_row)}
                  disabled={!canEdit || busy || !draft.stamp_text.trim()}
                  onChange={(e) => set("stamp_after_row", Number(e.target.value))}
                >
                  <option value="0">After the last row</option>
                  {draft.field_defs.map((def, i) => (
                    <option key={def.id} value={String(i + 1)}>
                      After row {i + 1} — {def.label || "untitled"}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="Footer note" hint="Small print at the bottom of every certificate.">
              <Textarea
                value={draft.footer_note}
                disabled={!canEdit || busy}
                onChange={(e) => set("footer_note", e.target.value)}
              />
            </Field>

            <Field
              label="Verification line"
              hint="Always the last line on a certificate. Use {{url}} for the record's own verification link. Empty uses “To verify, visit {{url}}”."
            >
              <Textarea
                value={draft.verify_note}
                disabled={!canEdit || busy}
                placeholder="To verify, visit {{url}}"
                onChange={(e) => set("verify_note", e.target.value)}
              />
            </Field>

            <div className="rounded-md border bg-surface-2/40 px-3 py-2">
              <div className="text-[12.5px] font-medium mb-1">Values that fill themselves in</div>
              <p className="text-[12px] text-text-muted mb-1.5">
                Type one of these into any row value, the certification mark or the notes above. It is replaced when
                the certificate is drawn, so it follows the record if the number or date is edited later.
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {TOKEN_HELP.map((t) => (
                  <span key={t.token} className="text-[12px] text-text-muted">
                    <code className="font-mono text-text">{t.token}</code> {t.means}
                  </span>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
