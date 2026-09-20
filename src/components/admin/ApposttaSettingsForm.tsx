"use client";

import { Upload, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ApposttaFields } from "@/components/admin/ApposttaFields";
import { Alert, Button, Field, Input, Modal, Textarea, errorMessage, useToast } from "@/components/ui";
import { api } from "@/lib/client";
import { uploadApposttaFile } from "@/lib/appostta-client";
import type { ApposttaField, ApposttaSettings } from "@/lib/types";

interface SettingsResponse {
  settings: ApposttaSettings;
  signature_data_uri: string | null;
}

/** Panel-wide defaults: what every certificate says, and the shared signature. */
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
  const [signature, setSignature] = useState<File | null>(null);
  const [clearSignature, setClearSignature] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSignature(null);
    setClearSignature(false);
    setError(null);
    setData(null);
    setDraft(null);
    api<SettingsResponse>("/api/admin/appostta/settings")
      .then((r) => {
        setData(r);
        setDraft(r.settings);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [open]);

  function set<K extends keyof ApposttaSettings>(key: K, value: ApposttaSettings[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      let signature_key: string | null | undefined;
      if (signature) {
        const up = await uploadApposttaFile(signature, "signatures");
        signature_key = up.key;
      } else if (clearSignature) {
        signature_key = null;
      }

      const payload: Record<string, unknown> = {
        org_name: draft.org_name,
        org_tagline: draft.org_tagline,
        number_prefix: draft.number_prefix,
        default_fields: draft.default_fields,
        signatory_name: draft.signatory_name,
        footer_note: draft.footer_note,
      };
      if (signature_key !== undefined) payload.signature_key = signature_key;

      const r = await api<{ settings: ApposttaSettings }>("/api/admin/appostta/settings", {
        method: "PATCH",
        json: payload,
      });
      toast("Appostta settings saved");
      onSaved(r.settings);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const showExisting = Boolean(data?.signature_data_uri) && !clearSignature && !signature;

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

            <Field label="Default certificate rows" hint="Every new record starts with these rows. Existing records are untouched.">
              <ApposttaFields
                value={draft.default_fields}
                disabled={!canEdit || busy}
                onChange={(f: ApposttaField[]) => set("default_fields", f)}
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Shared signatory name" hint="Used when a record does not set its own.">
                <Input
                  value={draft.signatory_name}
                  disabled={!canEdit || busy}
                  onChange={(e) => set("signatory_name", e.target.value)}
                />
              </Field>

              <Field label="Shared signature image" hint="PNG with a transparent background works best.">
                <div className="space-y-2">
                  {showExisting && data?.signature_data_uri ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={data.signature_data_uri}
                      alt="Current signature"
                      className="h-12 object-contain bg-surface-2 rounded border px-2"
                    />
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="sr-only"
                        disabled={!canEdit || busy}
                        onChange={(e) => {
                          setSignature(e.target.files?.[0] ?? null);
                          setClearSignature(false);
                        }}
                      />
                      <span className="inline-flex items-center gap-2 h-9 px-3.5 rounded-md border border-line-strong bg-surface text-sm font-medium cursor-pointer hover:bg-surface-2">
                        <Upload className="size-4" />
                        {showExisting ? "Replace" : "Upload"}
                      </span>
                    </label>
                    {signature ? (
                      <span className="text-[13px] text-text-muted inline-flex items-center gap-1.5">
                        {signature.name}
                        <button type="button" onClick={() => setSignature(null)} aria-label="Clear chosen signature">
                          <X className="size-3.5" />
                        </button>
                      </span>
                    ) : showExisting && canEdit ? (
                      <Button size="sm" disabled={busy} onClick={() => setClearSignature(true)}>
                        Remove
                      </Button>
                    ) : null}
                    {clearSignature ? <span className="text-[13px] text-text-muted">Will be removed on save</span> : null}
                  </div>
                </div>
              </Field>
            </div>

            <Field label="Footer note" hint="Small print at the bottom of every certificate.">
              <Textarea
                value={draft.footer_note}
                disabled={!canEdit || busy}
                onChange={(e) => set("footer_note", e.target.value)}
              />
            </Field>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
