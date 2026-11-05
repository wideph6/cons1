"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Field, Input, Modal, errorMessage, useToast } from "@/components/ui";
import { api } from "@/lib/client";
import { numberExample, PREFIX_RE, tidyPrefix } from "@/lib/appo-link";

/**
 * The super admin's setting for the three letters every new Appo attestation number starts with (APN
 * unless changed). It is saved in the database; documents already saved keep their numbers.
 */
export function AppoNumberPrefixDialog({
  open,
  onClose,
  prefix,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** The prefix in use now. */
  prefix: string;
  onSaved: (prefix: string) => void;
}) {
  const { toast } = useToast();
  const [value, setValue] = useState(prefix);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValue(prefix);
    setError(null);
  }, [open, prefix]);

  const next = tidyPrefix(value);
  const invalid = next !== "" && !PREFIX_RE.test(next);

  async function save() {
    if (!PREFIX_RE.test(next)) return setError("Type exactly three capital English letters, e.g. APN.");
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ number_prefix: string }>("/api/admin/appo/settings", { method: "PATCH", json: { number_prefix: next } });
      onSaved(r.number_prefix);
      toast(`New attestation numbers start with ${r.number_prefix}`);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="Attestation number prefix"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} disabled={!PREFIX_RE.test(next) || next === prefix} onClick={save}>
            Save prefix
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <p className="text-[13px] text-text-muted">
          Every Appo attestation number starts with these three letters, then three groups of four. Numbers that are
          generated, and numbers typed in by hand, use the prefix in use at the time. It is saved in the database and only
          the super admin can change it.
        </p>
        <Field
          label="Prefix"
          error={invalid ? "Exactly three capital English letters (A–Z)." : null}
          hint={PREFIX_RE.test(next) ? `New numbers will look like ${numberExample(next)}.` : "Three capital English letters, e.g. APN."}
        >
          <Input
            value={value}
            maxLength={3}
            disabled={busy}
            invalid={invalid}
            className="font-mono uppercase w-28"
            onChange={(e) => setValue(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
            }}
          />
        </Field>
        <Alert tone="info">
          Documents already saved keep their numbers, links and QR codes, so their verification links keep working. Only
          numbers made from now on start with the new prefix.
        </Alert>
      </div>
    </Modal>
  );
}
