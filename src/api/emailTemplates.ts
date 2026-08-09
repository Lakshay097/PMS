// FRONTEND client. Import `api` the same way your other src/api files do.
// Your teamReminder.ts uses `api.post(...)`, so mirror ITS import here.
// If teamReminder.ts has `import { api } from './client'`, keep the line
// below; if it's a different path (e.g. './http' or '../lib/api'), change it.
import { api } from './client';

export interface EmailTemplateRecord {
  templateName: string;
  subject: string;
  body: string;
  updatedAt: string;
  updatedBy?: string;
  source: 'sheets' | 'app';
}

export async function listEmailTemplates(): Promise<{ templates: EmailTemplateRecord[] }> {
  const json = await api.get<{ templates: EmailTemplateRecord[] }>('/email-templates');
  return { templates: json?.templates ?? [] };
}

export async function importEmailTemplatesFromSheets(): Promise<{
  imported: number;
  templates: EmailTemplateRecord[];
}> {
  return api.post<{ imported: number; templates: EmailTemplateRecord[] }>('/email-templates/import', {});
}

export async function saveEmailTemplate(
  templateName: string,
  data: { subject: string; body: string }
): Promise<{ record: EmailTemplateRecord; sheetsSynced: boolean }> {
  return api.put<{ record: EmailTemplateRecord; sheetsSynced: boolean }>(
    `/email-templates/${encodeURIComponent(templateName)}`,
    data
  );
}

export interface EmailTemplateMapping {
  [emailType: string]: string;
}

export async function getEmailTemplateMappings(): Promise<{ mappings: EmailTemplateMapping }> {
  return api.get<{ mappings: EmailTemplateMapping }>('/email-templates/mappings');
}

export async function updateEmailTemplateMapping(
  emailType: string,
  templateName: string
): Promise<{ mappings: EmailTemplateMapping }> {
  return api.put<{ mappings: EmailTemplateMapping }>('/email-templates/mappings', {
    emailType,
    templateName,
  });
}