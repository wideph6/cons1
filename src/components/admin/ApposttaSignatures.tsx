"use client";

import { Plus, Star, Trash2, Upload } from "lucide-react";
import { Badge, Button, IconButton, Input, Spinner } from "@/components/ui";
import type { ApposttaSignature } from "@/lib/types";

/** A signature being added or replaced: the file is only uploaded when the settings are saved. */
export interface PendingSignature {
  file: File;
  /** Object URL so the admin sees the image before it has been uploaded anywhere. */
  preview: string;
}

function newId(): string {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * The signatures the panel can issue under.
 *
 * A record picks one of these by name instead of uploading its own, and keeps a copy of what it
 * picked, so editing this list only affects records created afterwards.
 */
export function ApposttaSignatures({
  value,
  onChange,
  dataUris,
  pending,
  onPending,
  defaultId,
  onDefault,
  max = 24,
  disabled,
  busy,
}: {
  value: ApposttaSignature[];
  onChange: (next: ApposttaSignature[]) => void;
  /** Already-stored images, keyed by signature id. */
  dataUris: Record<string, string>;
  /** Images chosen in this session but not uploaded yet, keyed by signature id. */
  pending: Record<string, PendingSignature>;
  onPending: (id: string, next: PendingSignature | null) => void;
  defaultId: string;
  onDefault: (id: string) => void;
  max?: number;
  disabled?: boolean;
  busy?: boolean;
}) {
  function patch(index: number, part: Partial<ApposttaSignature>) {
    onChange(value.map((s, i) => (i === index ? { ...s, ...part } : s)));
  }

  function remove(index: number) {
    const gone = value[index];
    if (!gone) return;
    onPending(gone.id, null);
    onChange(value.filter((_, i) => i !== index));
    // Leaving the default pointing at a signature that is gone would preselect nothing.
    if (defaultId === gone.id) onDefault("");
  }

  function add() {
    const id = newId();
    onChange([...value, { id, name: "", r2_key: "", content_type: "image/png" }]);
    if (!defaultId) onDefault(id);
  }

  return (
    <div className="space-y-2.5">
      {value.length === 0 ? (
        <p className="text-[12.5px] text-text-muted">
          No signatures yet. Add one for each person who signs, then a record just picks the right name.
        </p>
      ) : null}

      {value.map((sig, i) => {
        const chosen = pending[sig.id];
        const image = chosen?.preview ?? dataUris[sig.id] ?? null;
        const isDefault = defaultId === sig.id || (!defaultId && i === 0);
        return (
          <div key={sig.id} className="rounded-md border bg-surface-2/40 p-3">
            <div className="flex flex-wrap items-start gap-3">
              <div className="h-14 w-28 shrink-0 rounded border bg-surface flex items-center justify-center overflow-hidden">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image} alt={sig.name || "Signature"} className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-[11px] text-text-muted px-2 text-center">No image</span>
                )}
              </div>

              <div className="flex-1 min-w-[12rem] space-y-2">
                <Input
                  value={sig.name}
                  disabled={disabled}
                  placeholder="Name printed under the signature"
                  onChange={(e) => patch(i, { name: e.target.value })}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="sr-only"
                      disabled={disabled}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) onPending(sig.id, { file, preview: URL.createObjectURL(file) });
                        // Cleared so choosing the same file twice still fires a change.
                        e.target.value = "";
                      }}
                    />
                    <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-line-strong bg-surface text-[13px] font-medium cursor-pointer hover:bg-surface-2">
                      <Upload className="size-3.5" />
                      {image ? "Replace image" : "Upload image"}
                    </span>
                  </label>

                  {chosen ? <span className="text-[12.5px] text-text-muted">{chosen.file.name}</span> : null}

                  {isDefault ? (
                    <Badge tone="teal">preselected</Badge>
                  ) : (
                    <Button
                      size="sm"
                      icon={<Star className="size-3.5" />}
                      disabled={disabled}
                      onClick={() => onDefault(sig.id)}
                    >
                      Preselect
                    </Button>
                  )}
                </div>
              </div>

              <IconButton label={`Remove signature ${i + 1}`} tone="danger" disabled={disabled} onClick={() => remove(i)}>
                <Trash2 className="size-4" />
              </IconButton>
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-2">
        <Button size="sm" icon={<Plus className="size-3.5" />} disabled={disabled || value.length >= max} onClick={add}>
          Add signature
        </Button>
        {busy ? (
          <span className="text-[12.5px] text-text-muted inline-flex items-center gap-1.5">
            <Spinner className="size-3.5" /> Uploading signature images…
          </span>
        ) : null}
        {value.length >= max ? <span className="text-[12px] text-text-muted">Maximum {max} signatures.</span> : null}
      </div>
    </div>
  );
}
