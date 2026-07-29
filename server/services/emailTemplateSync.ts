import { firestoreAdmin } from './firebaseAdmin';
import { generateGoogleSheetsToken } from './googleSheetsService';
import { config } from '../config';

/**
 * Email template sync: Google Sheets ⇄ Firestore
 *
 * Uses the SAME auth mechanism the rest of your server uses
 * (generateGoogleSheetsToken from googleSheetsService) instead of the
 * `googleapis` package, so there is nothing new to install.
 */
const SPREADSHEET_ID = config.GOOGLE_SPREADSHEET_ID;

const SHEET_NAME = 'email_templates';
const COLLECTION = 'emailTemplates';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

export interface EmailTemplateRecord {
  templateName: string;
  subject: string;
  body: string;
  updatedAt: string;   // ISO
  updatedBy?: string;  // acting admin's email
  source: 'sheets' | 'app';
}

// ─── low-level sheet helpers (token + fetch) ─────────────────────────

async function authHeader(): Promise<Record<string, string>> {
  const tokenData = await generateGoogleSheetsToken();
  if (!tokenData || !tokenData.accessToken) {
    throw new Error('Failed to generate Google Sheets token');
  }
  return { Authorization: `Bearer ${tokenData.accessToken}`, 'Content-Type': 'application/json' };
}

async function sheetGet(range: string): Promise<string[][]> {
  if (!SPREADSHEET_ID) throw new Error('SPREADSHEET_ID is not configured for email template sync');
  const url = `${SHEETS_API}/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`;
  const res = await fetch(url, { headers: await authHeader() });
  if (!res.ok) throw new Error(`Sheets GET ${range} failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { values?: unknown[][] };
  return (data.values ?? []).map((row) => row.map((c) => (c ?? '').toString()));
}

async function sheetUpdate(range: string, values: string[][]): Promise<void> {
  const url = `${SHEETS_API}/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: await authHeader(),
    body: JSON.stringify({ values }),
  });
  if (!res.ok) throw new Error(`Sheets UPDATE ${range} failed: ${res.status} ${await res.text()}`);
}

async function sheetAppend(values: string[][]): Promise<void> {
  const url = `${SHEETS_API}/${SPREADSHEET_ID}/values/${encodeURIComponent(`${SHEET_NAME}!A:D`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: 'POST',
    headers: await authHeader(),
    body: JSON.stringify({ values }),
  });
  if (!res.ok) throw new Error(`Sheets APPEND failed: ${res.status} ${await res.text()}`);
}

async function readRows(): Promise<string[][]> {
  return sheetGet(`${SHEET_NAME}!A2:D`); // skip header row
}

async function findRowIndex(templateName: string): Promise<number | null> {
  const rows = await readRows();
  const i = rows.findIndex((r) => (r[0] ?? '').trim() === templateName.trim());
  return i === -1 ? null : i + 2; // +2: data starts at A2
}

// ─── import: Sheets → Firestore ──────────────────────────────────────

export async function importTemplatesFromSheets(
  actingUserEmail: string
): Promise<EmailTemplateRecord[]> {
  const rows = await readRows();
  const now = new Date().toISOString();
  const batch = firestoreAdmin.batch();
  const imported: EmailTemplateRecord[] = [];

  for (const row of rows) {
    const templateName = (row[0] ?? '').trim();
    if (!templateName) continue;
    const record: EmailTemplateRecord = {
      templateName,
      subject: row[1] ?? '',
      body: row[2] ?? '',
      updatedAt: now,
      updatedBy: actingUserEmail,
      source: 'sheets',
    };
    batch.set(firestoreAdmin.collection(COLLECTION).doc(templateName), record, { merge: true });
    imported.push(record);
  }

  await batch.commit();
  console.info(`[emailTemplateSync] imported ${imported.length} templates from ${SHEET_NAME} by ${actingUserEmail}`);
  return imported;
}

// ─── save: app → Firestore AND Sheets ────────────────────────────────

export async function saveTemplate(
  template: Pick<EmailTemplateRecord, 'templateName' | 'subject' | 'body'>,
  actingUserEmail: string
): Promise<{ record: EmailTemplateRecord; sheetsSynced: boolean }> {
  const templateName = template.templateName.trim();
  if (!templateName) throw new Error('templateName is required');

  const record: EmailTemplateRecord = {
    templateName,
    subject: template.subject ?? '',
    body: template.body ?? '',
    updatedAt: new Date().toISOString(),
    updatedBy: actingUserEmail,
    source: 'app',
  };

  // 1) Firestore first — this is what the mail senders read.
  await firestoreAdmin.collection(COLLECTION).doc(templateName).set(record, { merge: true });

  // 2) Write back to the sheet (retry once).
  let sheetsSynced = false;
  const values = [[record.templateName, record.subject, record.body, record.updatedAt]];
  for (let attempt = 1; attempt <= 2 && !sheetsSynced; attempt++) {
    try {
      const rowIndex = await findRowIndex(templateName);
      if (rowIndex) await sheetUpdate(`${SHEET_NAME}!A${rowIndex}:D${rowIndex}`, values);
      else await sheetAppend(values);
      sheetsSynced = true;
    } catch (err) {
      console.error(`[emailTemplateSync] sheet write-back failed for "${templateName}" (attempt ${attempt})`, err);
    }
  }

  return { record, sheetsSynced };
}

// ─── list ────────────────────────────────────────────────────────────

export async function listTemplates(): Promise<EmailTemplateRecord[]> {
  const snap = await firestoreAdmin.collection(COLLECTION).get();
  return snap.docs
    .map((d) => d.data() as EmailTemplateRecord)
    .sort((a, b) => a.templateName.localeCompare(b.templateName));
}