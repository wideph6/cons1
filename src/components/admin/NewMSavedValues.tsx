"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Alert, ConfirmDialog, IconButton, Modal, errorMessage, useToast } from "@/components/ui";
import { api } from "@/lib/client";
import type { NewMLists, NewMOfficer, NewMOption, NewMOptionKind } from "@/lib/types";

const SECTIONS: Array<{ kind: NewMOptionKind; title: string }> = [
  { kind: "document_type", title: "Document types" },
  { kind: "issuing_office", title: "Issuing offices" },
  { kind: "issuing_authority", title: "Issuing authorities" },
];

type Removal = { what: "option"; item: NewMOption } | { what: "officer"; item: NewMOfficer };

/**
 * Everything typed into an upload so far, offered again on every later upload. Values are added from
 * the upload form; here they can only be looked through and removed. Removing one never changes a
 * document that already uses it.
 */
export function NewMSavedValues({
  open,
  onClose,
  lists,
  canRemove,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  lists: NewMLists | null;
  canRemove: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const [removal, setRemoval] = useState<Removal | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!removal) return;
    setBusy(true);
    try {
      if (removal.what === "option") {
        await api(`/api/admin/new-m/options/${removal.item.id}`, { method: "DELETE" });
        toast(`${removal.item.value} removed from the saved list`);
      } else {
        await api(`/api/admin/new-m/officers/${removal.item.id}`, { method: "DELETE" });
        toast(`${removal.item.name} removed from the saved officers`);
      }
      setRemoval(null);
      await onChanged();
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title="Saved values" width="max-w-3xl">
        <div className="space-y-4">
          <p className="text-[13px] text-text-muted">
            Anything typed into an upload is saved here and offered on every later upload. Removing a value only takes
            it off the list — documents that already use it keep it.
          </p>
          {!canRemove ? <Alert tone="info">You can look through the saved values but not remove them.</Alert> : null}

          <div className="grid gap-3 sm:grid-cols-3">
            {SECTIONS.map(({ kind, title }) => {
              const items = lists?.options[kind] ?? [];
              return (
                <section key={kind} className="border rounded-md">
                  <h3 className="px-3 h-9 flex items-center border-b text-[13px] font-semibold">
                    {title} <span className="ml-1.5 text-text-faint font-normal">{items.length}</span>
                  </h3>
                  {items.length === 0 ? (
                    <p className="px-3 py-2.5 text-[12.5px] text-text-faint">Nothing saved yet.</p>
                  ) : (
                    <ul className="divide-y max-h-64 overflow-auto">
                      {items.map((o) => (
                        <li key={o.id} className="px-3 py-1.5 flex items-center gap-2 text-[13px]">
                          <span className="flex-1 min-w-0 break-words">{o.value}</span>
                          {canRemove ? (
                            <IconButton label="Remove" tone="danger" onClick={() => setRemoval({ what: "option", item: o })}>
                              <Trash2 className="size-3.5" />
                            </IconButton>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>

          <section className="border rounded-md">
            <h3 className="px-3 h-9 flex items-center border-b text-[13px] font-semibold">
              Approving officers <span className="ml-1.5 text-text-faint font-normal">{lists?.officers.length ?? 0}</span>
            </h3>
            {!lists || lists.officers.length === 0 ? (
              <p className="px-3 py-2.5 text-[12.5px] text-text-faint">
                Nothing saved yet. Choose “Add a new officer” while uploading a document to save the first one.
              </p>
            ) : (
              <ul className="divide-y max-h-80 overflow-auto">
                {lists.officers.map((o) => (
                  <li key={o.id} className="px-3 py-2 flex items-center gap-3 text-[13px]">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium break-words">{o.name}</div>
                      <div className="text-text-muted break-words">{o.designation || "No designation"}</div>
                    </div>
                    {o.signature_url ? (
                      <img src={o.signature_url} alt={`Signature of ${o.name}`} className="h-10 max-w-40 object-contain border rounded bg-white p-1" />
                    ) : (
                      <span className="text-[12px] text-text-faint">No signature</span>
                    )}
                    {canRemove ? (
                      <IconButton label="Remove" tone="danger" onClick={() => setRemoval({ what: "officer", item: o })}>
                        <Trash2 className="size-3.5" />
                      </IconButton>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(removal)}
        onClose={() => setRemoval(null)}
        onConfirm={remove}
        loading={busy}
        danger
        title={removal?.what === "officer" ? "Remove this officer?" : "Remove this value?"}
        confirmLabel="Remove"
        message={
          removal?.what === "officer" ? (
            <>
              <strong>{removal.item.name}</strong> will no longer be offered on new uploads. Documents already given this
              officer keep their name, designation and signature.
            </>
          ) : removal ? (
            <>
              <strong>{removal.item.value}</strong> will no longer be offered on new uploads. Documents that already use it
              keep it.
            </>
          ) : null
        }
      />
    </>
  );
}
