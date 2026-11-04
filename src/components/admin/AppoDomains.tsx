"use client";

import { Globe, Link2, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  Textarea,
  errorMessage,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/client";
import {
  cleanTemplate,
  hasNumberToken,
  LINK_TOKENS,
  NUMBER_EXAMPLE,
  resolveLink,
  STANDARD_TEMPLATE,
} from "@/lib/appo-link";
import type { AppoDomain, AppoLink } from "@/lib/appo-types";

function todayLocalIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** What a hostname would be saved as, loosely, so the link preview shows it while it is typed. */
function previewHost(input: string): string {
  return input.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/[/?#].*$/, "") || "your-domain.com";
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

type Removal = { what: "domain"; item: AppoDomain } | { what: "link"; item: AppoLink; domain: AppoDomain };

/**
 * Appo's own domains and, under each, the links documents can be built on. Kept apart from the
 * Domains page. A link is written freely after the domain, with formulas where each document's
 * attestation number and date belong.
 */
export function AppoDomains({
  open,
  onClose,
  domains,
  canManage,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  domains: AppoDomain[];
  canManage: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const [domainForm, setDomainForm] = useState<{ domain: AppoDomain | null } | null>(null);
  const [linkForm, setLinkForm] = useState<{ domain: AppoDomain; link: AppoLink | null } | null>(null);
  const [removal, setRemoval] = useState<Removal | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!removal) return;
    setBusy(true);
    try {
      if (removal.what === "domain") {
        await api(`/api/admin/appo/domains/${removal.item.id}`, { method: "DELETE" });
        toast(`${removal.item.hostname} deleted`);
      } else {
        await api(`/api/admin/appo/links/${removal.item.id}`, { method: "DELETE" });
        toast("Link deleted");
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
      <Modal
        open={open}
        onClose={onClose}
        title="Appo domains & links"
        width="max-w-4xl"
        footer={
          canManage ? (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setDomainForm({ domain: null })}>
              Add domain
            </Button>
          ) : undefined
        }
      >
        <div className="space-y-4">
          <p className="text-[13px] text-text-muted">
            These domains are Appo&apos;s own — the Domains page is not used here. Each domain can have as many links as
            you need. A document picks a domain and one of its links; its QR code holds the complete link.
          </p>
          {!canManage ? <Alert tone="info">You can look through the domains and links but not change them.</Alert> : null}

          {domains.length === 0 ? (
            <EmptyState
              title="No domains yet"
              description="Add the first domain or subdomain, then the links documents will be built on."
              action={
                canManage ? (
                  <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setDomainForm({ domain: null })}>
                    Add domain
                  </Button>
                ) : undefined
              }
            />
          ) : null}

          {domains.map((d) => (
            <section key={d.id} className="border rounded-md">
              <header className="flex flex-wrap items-center gap-2 px-3 py-2 border-b bg-surface-2 rounded-t-md">
                <Globe className="size-4 text-ink-600" />
                <span className="font-mono text-[13.5px] font-medium">{d.hostname}</span>
                <Badge>{plural(d.document_count, "document")}</Badge>
                {d.notes ? <span className="text-[12.5px] text-text-muted truncate max-w-[20rem]">{d.notes}</span> : null}
                {canManage ? (
                  <div className="ml-auto flex items-center gap-1">
                    <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setLinkForm({ domain: d, link: null })}>
                      Add link
                    </Button>
                    <IconButton label="Edit domain" onClick={() => setDomainForm({ domain: d })}>
                      <Pencil className="size-3.5" />
                    </IconButton>
                    <IconButton label="Delete domain" tone="danger" onClick={() => setRemoval({ what: "domain", item: d })}>
                      <Trash2 className="size-3.5" />
                    </IconButton>
                  </div>
                ) : null}
              </header>

              {d.links.length === 0 ? (
                <p className="px-3 py-2.5 text-[12.5px] text-warn-600">
                  No links yet — documents cannot use this domain until it has one.
                </p>
              ) : (
                <ul className="divide-y">
                  {d.links.map((l) => (
                    <li key={l.id} className="px-3 py-2 flex items-start gap-2.5">
                      <Link2 className="size-3.5 text-text-faint mt-1 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
                          <span className="font-medium">{l.name || "Untitled link"}</span>
                          <Badge>{plural(l.document_count, "document")}</Badge>
                          {hasNumberToken(l.template) ? null : <Badge tone="warn">no attestation number</Badge>}
                        </div>
                        <div className="font-mono text-[12px] break-all mt-0.5">
                          <span className="text-text-faint">https://{d.hostname}</span>
                          <TemplateText template={l.template} />
                        </div>
                      </div>
                      {canManage ? (
                        <div className="flex items-center gap-0.5">
                          <IconButton label="Edit link" onClick={() => setLinkForm({ domain: d, link: l })}>
                            <Pencil className="size-3.5" />
                          </IconButton>
                          <IconButton label="Delete link" tone="danger" onClick={() => setRemoval({ what: "link", item: l, domain: d })}>
                            <Trash2 className="size-3.5" />
                          </IconButton>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </Modal>

      <DomainDialog
        state={domainForm}
        onClose={() => setDomainForm(null)}
        onSaved={async (message) => {
          toast(message);
          setDomainForm(null);
          await onChanged();
        }}
      />

      <LinkDialog
        state={linkForm}
        onClose={() => setLinkForm(null)}
        onSaved={async (message) => {
          toast(message);
          setLinkForm(null);
          await onChanged();
        }}
      />

      <ConfirmDialog
        open={Boolean(removal)}
        onClose={() => setRemoval(null)}
        onConfirm={remove}
        loading={busy}
        danger
        title={removal?.what === "domain" ? `Delete ${removal.item.hostname}?` : "Delete this link?"}
        confirmLabel={removal?.what === "domain" ? "Delete domain and documents" : "Delete link"}
        message={
          removal?.what === "domain" ? (
            <p>
              This removes the domain, its {plural(removal.item.links.length, "link")} and its{" "}
              <strong>{plural(removal.item.document_count, "document")}</strong> with their PDFs. This cannot be undone.
            </p>
          ) : removal?.what === "link" ? (
            <p>
              {removal.item.document_count
                ? `${plural(removal.item.document_count, "document")} use this link. They keep their current link and QR code, but new documents can no longer pick it.`
                : "No document uses this link."}
            </p>
          ) : null
        }
      />
    </>
  );
}

/** A link with its formulas picked out, so they read as placeholders rather than literal text. */
function TemplateText({ template }: { template: string }) {
  const parts = template.split(/(\{attestation_number\}|\{issue_date\})/);
  return (
    <>
      {parts.map((p, i) =>
        p === LINK_TOKENS.number || p === LINK_TOKENS.date ? (
          <span key={i} className="rounded bg-teal-50 text-teal-800 px-0.5">
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/**
 * The link box: the domain in front, the rest typed freely, with buttons that drop a formula in at
 * the cursor. Shows the tidied link, what it becomes for a sample document, and any problem with it.
 */
function TemplateInput({
  hostname,
  value,
  onChange,
  disabled,
  optional,
}: {
  hostname: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** The first link of a new domain may be left empty. */
  optional?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);

  function insert(token: string) {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  const check = useMemo(() => {
    if (!value.trim()) return { template: null, error: optional ? null : "Enter the link" };
    try {
      return { template: cleanTemplate(value, hostname), error: null };
    } catch (e) {
      return { template: null, error: e instanceof Error ? e.message : "That link is not valid" };
    }
  }, [value, hostname, optional]);

  return (
    <div className="space-y-2">
      <div className="flex items-stretch rounded-md border border-line-strong overflow-hidden focus-within:border-teal-600">
        <span className="px-2.5 flex items-center bg-surface-2 border-r font-mono text-[12.5px] text-text-muted whitespace-nowrap max-w-[45%] truncate">
          https://{hostname}
        </span>
        <input
          ref={ref}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder="/verify?attestation_number={attestation_number}&issue_date={issue_date}"
          className="flex-1 min-w-0 px-2.5 py-2 font-mono text-[13px] bg-surface outline-none"
          spellCheck={false}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" disabled={disabled} onClick={() => insert(LINK_TOKENS.number)} title={`Inserts ${LINK_TOKENS.number}`}>
          + Attestation number
        </Button>
        <Button size="sm" disabled={disabled} onClick={() => insert(LINK_TOKENS.date)} title={`Inserts ${LINK_TOKENS.date}`}>
          + Date (DDMMYYYY)
        </Button>
        <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onChange(STANDARD_TEMPLATE)}>
          Use the standard link
        </Button>
      </div>
      {check.error ? <p className="text-[12.5px] text-danger-600">{check.error}</p> : null}
      {check.template ? (
        <div className="rounded-md border bg-surface-2 px-3 py-2 space-y-1">
          <div className="text-[11.5px] text-text-muted">A document numbered {NUMBER_EXAMPLE} and dated today gets</div>
          <div className="font-mono text-[12.5px] break-all">
            {resolveLink(hostname, check.template, NUMBER_EXAMPLE, todayLocalIso())}
          </div>
          {hasNumberToken(check.template) ? null : (
            <div className="text-[12px] text-warn-600">
              This link has no attestation number, so every document on it gets the same link and the same QR code.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function DomainDialog({
  state,
  onClose,
  onSaved,
}: {
  state: { domain: AppoDomain | null } | null;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const editing = state?.domain ?? null;
  const [hostname, setHostname] = useState("");
  const [notes, setNotes] = useState("");
  const [linkName, setLinkName] = useState("");
  const [template, setTemplate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state) return;
    setHostname(state.domain?.hostname ?? "");
    setNotes(state.domain?.notes ?? "");
    setLinkName("Standard");
    setTemplate(state.domain ? "" : STANDARD_TEMPLATE);
    setError(null);
  }, [state]);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      if (editing) {
        const r = await api<{ qr_replaced: number }>(`/api/admin/appo/domains/${editing.id}`, {
          method: "PATCH",
          json: { hostname, notes },
        });
        await onSaved(r.qr_replaced ? `Domain saved — ${plural(r.qr_replaced, "QR code")} replaced` : "Domain saved");
      } else {
        await api("/api/admin/appo/domains", {
          json: { hostname, notes, link_name: template.trim() ? linkName : "", link_template: template },
        });
        await onSaved(`${previewHost(hostname)} added`);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const host = previewHost(hostname);
  const hostChanged = Boolean(editing && host !== editing.hostname);

  return (
    <Modal
      open={Boolean(state)}
      onClose={busy ? () => undefined : onClose}
      title={editing ? `Edit ${editing.hostname}` : "Add an Appo domain"}
      width="max-w-2xl"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            {editing ? "Save" : "Add domain"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field label="Domain or subdomain" hint="For example baxoq.pk or verify.baxoq.pk">
          <Input value={hostname} disabled={busy} onChange={(e) => setHostname(e.target.value)} placeholder="verify.example.com" autoFocus />
        </Field>
        {hostChanged && editing?.document_count ? (
          <Alert tone="warn">
            {plural(editing.document_count, "document")} on this domain will get a new link, and each new QR code replaces
            the saved one. QR codes already printed keep pointing at the old domain.
          </Alert>
        ) : null}
        <Field label="Notes (optional)">
          <Textarea value={notes} disabled={busy} onChange={(e) => setNotes(e.target.value)} className="min-h-16" />
        </Field>
        {editing ? null : (
          <div className="rounded-md border p-3 space-y-3">
            <div className="text-[13px] font-medium">First link (optional)</div>
            <Field label="Link name" hint="Shown when a document picks its link.">
              <Input value={linkName} disabled={busy} onChange={(e) => setLinkName(e.target.value)} />
            </Field>
            <TemplateInput hostname={host} value={template} onChange={setTemplate} disabled={busy} optional />
          </div>
        )}
      </div>
    </Modal>
  );
}

function LinkDialog({
  state,
  onClose,
  onSaved,
}: {
  state: { domain: AppoDomain; link: AppoLink | null } | null;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const editing = state?.link ?? null;
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state) return;
    setName(state.link?.name ?? "");
    setTemplate(state.link?.template ?? STANDARD_TEMPLATE);
    setError(null);
  }, [state]);

  async function save() {
    if (!state) return;
    setError(null);
    setBusy(true);
    try {
      if (editing) {
        const r = await api<{ qr_replaced: number }>(`/api/admin/appo/links/${editing.id}`, {
          method: "PATCH",
          json: { name, template },
        });
        await onSaved(r.qr_replaced ? `Link saved — ${plural(r.qr_replaced, "QR code")} replaced` : "Link saved");
      } else {
        await api("/api/admin/appo/links", { json: { domain_id: state.domain.id, name, template } });
        await onSaved("Link added");
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  let changesLink = false;
  if (editing) {
    try {
      changesLink = cleanTemplate(template, state?.domain.hostname ?? "") !== editing.template;
    } catch {
      changesLink = false;
    }
  }

  return (
    <Modal
      open={Boolean(state)}
      onClose={busy ? () => undefined : onClose}
      title={editing ? "Edit link" : `New link on ${state?.domain.hostname ?? ""}`}
      width="max-w-2xl"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            {editing ? "Save" : "Add link"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field label="Link name (optional)" hint="Shown when a document picks its link, e.g. General attestation.">
          <Input value={name} disabled={busy} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Link" hint="Everything after the domain. Put the formulas wherever each document's own values belong.">
          <TemplateInput hostname={state?.domain.hostname ?? ""} value={template} onChange={setTemplate} disabled={busy} />
        </Field>
        {changesLink && editing?.document_count ? (
          <Alert tone="warn">
            {plural(editing.document_count, "document")} use this link. Each gets the new link, and its new QR code replaces
            the saved one. QR codes already printed keep pointing at the old link.
          </Alert>
        ) : null}
      </div>
    </Modal>
  );
}
