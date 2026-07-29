import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CloudDownload,
  Loader2,
  Save,
} from 'lucide-react';
import {
  EmailTemplateRecord,
  importEmailTemplatesFromSheets,
  listEmailTemplates,
  saveEmailTemplate,
} from '../../api/emailTemplates';
import { FormField, Input, Textarea } from '../shared/FormField';

/**
 * Email templates tab for the Admin Panel.
 *
 * Replaces the old selectedEmailTemplateKey / tempEmailSubject /
 * tempEmailValue block in AdminPanel.tsx. Render inside the panel:
 *
 *   {activeAdminSubTab === 'email_templates' && <EmailTemplatesTab />}
 *
 * Flow:
 * - "Import from Sheets" pulls the formatted templates from the Google
 *   Sheet into Firestore (sheet wins).
 * - Editing + Save writes to Firestore AND back to the Sheet. If the
 *   sheet write-back fails, the save still succeeds and a warning shows
 *   that the sheet is behind.
 */
interface EmailTemplatesTabProps {
  /** Optional — the tab fetches its own data, but AdminPanel may still pass these. */
  emailTemplates?: unknown;
  onRefreshEmailTemplates?: () => void | Promise<void>;
  isDarkMode?: boolean;
}

export default function EmailTemplatesTab({
  onRefreshEmailTemplates,
}: EmailTemplatesTabProps = {}) {
  const [templates, setTemplates] = useState<EmailTemplateRecord[]>([]);
  const [selectedName, setSelectedName] = useState<string>('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<
    | { kind: 'ok' | 'warn' | 'error'; text: string }
    | null
  >(null);

  const selected = useMemo(
  () => (templates ?? []).find((t) => t.templateName === selectedName) ?? null,
  [templates, selectedName]
  );
  const isDirty =
    !!selected && (subject !== selected.subject || body !== selected.body);

  const load = async () => {
  setLoading(true);
  try {
    const res = await listEmailTemplates();
    const list = Array.isArray(res?.templates) ? res.templates : [];
    setTemplates(list);
    if (list.length && !list.some((t) => t.templateName === selectedName)) {
      setSelectedName(list[0].templateName);
    }
  } catch (err: any) {
    setTemplates([]);
    setStatus({ kind: 'error', text: err?.message ?? 'Could not load templates' });
  } finally {
    setLoading(false);
  }
};

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync editor when selection changes.
  useEffect(() => {
    if (selected) {
      setSubject(selected.subject);
      setBody(selected.body);
    }
  }, [selected?.templateName]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleImport = async () => {
    if (
      isDirty &&
      !window.confirm(
        'Importing replaces templates with the Sheet versions. Your unsaved edit will be lost. Continue?'
      )
    ) {
      return;
    }
    setImporting(true);
    setStatus(null);
    try {
      const { imported, templates: list } = await importEmailTemplatesFromSheets();
      setTemplates(list);
      const still = list.find((t) => t.templateName === selectedName) ?? list[0];
      if (still) {
        setSelectedName(still.templateName);
        setSubject(still.subject);
        setBody(still.body);
      }
      setStatus({ kind: 'ok', text: `Imported ${imported} templates from Sheets` });
    } catch (err: any) {
      setStatus({ kind: 'error', text: err.message ?? 'Import failed' });
    } finally {
      setImporting(false);
    }
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    setStatus(null);
    try {
      const { record, sheetsSynced } = await saveEmailTemplate(
        selected.templateName,
        { subject, body }
      );
      setTemplates((prev) =>
        prev.map((t) => (t.templateName === record.templateName ? record : t))
      );
      await onRefreshEmailTemplates?.();
      setStatus(
        sheetsSynced
          ? { kind: 'ok', text: 'Saved — synced to Firestore and Sheets' }
          : {
              kind: 'warn',
              text: 'Saved to the app, but the Sheet could not be updated. Emails will use your new version; re-save later to retry the sheet sync.',
            }
      );
    } catch (err: any) {
      setStatus({ kind: 'error', text: err.message ?? 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  // Simple variable highlight for preview: {{name}}, {taskTitle}, etc.
  const previewBody = useMemo(
    () =>
      body.replace(
        /(\{\{?\s*[\w.]+\s*\}?\})/g,
        '<mark style="background:var(--color-primary-soft);color:var(--color-primary);border-radius:3px;padding:0 2px;">$1</mark>'
      ),
    [body]
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-secondary p-8">
        <Loader2 size={18} className="animate-spin" /> Loading templates…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-primary">Email templates</h3>
          <p className="text-sm text-muted">
            Imported from Google Sheets. Edits here save to the app and sync back
            to the Sheet.
          </p>
        </div>
        <button
          onClick={handleImport}
          disabled={importing}
          className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium
            border border-token text-secondary hover-surface disabled:opacity-50"
        >
          {importing ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <CloudDownload size={16} />
          )}
          Import from Sheets
        </button>
      </div>

      {/* Status banner */}
      {status && (
        <div
          role="status"
          className={`flex items-start gap-2 rounded-md px-3 py-2.5 text-sm ${
            status.kind === 'ok'
              ? 'bg-[var(--color-success-bg)] text-[var(--color-success-fg)]'
              : status.kind === 'warn'
              ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning-fg)]'
              : 'bg-[var(--color-danger-bg)] text-[var(--color-danger-fg)]'
          }`}
        >
          {status.kind === 'ok' ? (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          )}
          <span>{status.text}</span>
        </div>
      )}

      {templates.length === 0 ? (
        <div className="border border-dashed border-token rounded-lg p-8 text-center">
          <p className="text-sm text-secondary mb-1">No templates yet.</p>
          <p className="text-sm text-muted">
            Use “Import from Sheets” to pull in your existing templates.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
          {/* Template list */}
          <div className="border border-token rounded-lg bg-surface overflow-hidden lg:max-h-[520px] lg:overflow-y-auto">
            {templates.map((t) => (
              <button
                key={t.templateName}
                onClick={() => setSelectedName(t.templateName)}
                className={`w-full text-left px-3 py-2.5 text-sm border-b border-token last:border-b-0 transition-colors ${
                  t.templateName === selectedName
                    ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary)] font-medium'
                    : 'text-secondary hover-surface'
                }`}
              >
                <div className="truncate">{t.templateName}</div>
                <div className="text-[11px] text-muted truncate">
                  {t.source === 'sheets' ? 'From Sheets' : 'Edited in app'} ·{' '}
                  {new Date(t.updatedAt).toLocaleDateString()}
                </div>
              </button>
            ))}
          </div>

          {/* Editor */}
          {selected && (
            <div className="space-y-4">
              <FormField label="Subject" htmlFor="tpl-subject">
                <Input
                  id="tpl-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. New task assigned: {{taskTitle}}"
                />
              </FormField>

              <FormField
                label="Body"
                htmlFor="tpl-body"
                hint="Variables like {{userName}} and {{taskTitle}} are filled in when the email is sent."
              >
                <Textarea
                  id="tpl-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={12}
                />
              </FormField>

              {/* Preview */}
              <div>
                <div className="text-sm font-medium text-primary mb-1.5">Preview</div>
                <div className="border border-token rounded-md bg-surface-1 px-4 py-3">
                  <div className="text-sm font-semibold text-primary mb-2 pb-2 border-b border-token">
                    {subject || <span className="text-muted">No subject</span>}
                  </div>
                  <div
                    className="text-sm text-secondary whitespace-pre-wrap leading-relaxed"
                    // Body comes from your own Sheet/Firestore admins only;
                    // variables are highlighted, everything else is text.
                    dangerouslySetInnerHTML={{ __html: previewBody }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="text-xs text-muted">
                  Last updated {new Date(selected.updatedAt).toLocaleString()}
                  {selected.updatedBy ? ` by ${selected.updatedBy}` : ''}
                </span>
                <button
                  onClick={handleSave}
                  disabled={!isDirty || saving}
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium
                    text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]
                    disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {saving ? 'Saving…' : 'Save and sync'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}