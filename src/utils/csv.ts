/**
 * Robust CSV utilities for bulk user upload.
 *
 * Fixes over the previous implementation in AdminPanel.tsx:
 *  - Handles quoted fields containing commas, quotes ("") and newlines (RFC 4180)
 *  - Strips UTF-8 BOM (Excel exports) and CR from CRLF line endings
 *    (the old parser left a trailing \r on the last column, silently
 *    breaking email validation for every Windows/Excel CSV)
 *  - Normalizes headers (case/space-insensitive matching)
 *  - Validates role, password length and email format per row
 *  - Detects duplicates BOTH against existing users AND within the file itself
 */

export interface CsvUserRow {
  rowNumber: number; // 1-based, excluding header — for error messages
  FullName: string;
  Email: string;
  Role: string;
  ManagerEmail: string;
  TeamName: string;
  Password: string;
}

export interface CsvRowError {
  rowNumber: number;
  fullName: string;
  email: string;
  error: string;
}

export interface CsvParseResult {
  valid: CsvUserRow[];
  errors: CsvRowError[];
}

const VALID_ROLES = ['Admin', 'Stakeholder', 'Sub-stakeholder'] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** RFC 4180-style CSV parser. Returns rows of raw string cells. */
export function parseCsvText(text: string): string[][] {
  // Strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'; // escaped quote
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++; // CRLF
      row.push(field);
      field = '';
      // Skip fully-empty trailing rows
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  // Flush last row
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);

  return rows;
}

/** Normalize a header for matching: "Manager  Email " -> "manageremail" */
const normHeader = (h: string) => h.toLowerCase().replace(/[^a-z]/g, '');

const HEADER_MAP: Record<string, keyof Omit<CsvUserRow, 'rowNumber'>> = {
  fullname: 'FullName',
  name: 'FullName',
  email: 'Email',
  emailaddress: 'Email',
  role: 'Role',
  manageremail: 'ManagerEmail',
  manager: 'ManagerEmail',
  teamname: 'TeamName',
  team: 'TeamName',
  password: 'Password',
};

/**
 * Parse + validate a users CSV.
 * @param text          Raw file contents
 * @param existingEmails Lower-cased emails already in the system
 */
export function parseAndValidateUsersCsv(
  text: string,
  existingEmails: Set<string>
): CsvParseResult {
  const raw = parseCsvText(text);
  const result: CsvParseResult = { valid: [], errors: [] };

  if (raw.length === 0) {
    result.errors.push({
      rowNumber: 0,
      fullName: '',
      email: '',
      error: 'File is empty',
    });
    return result;
  }

  const headers = raw[0].map(normHeader);
  const colIndex: Partial<Record<keyof Omit<CsvUserRow, 'rowNumber'>, number>> = {};
  headers.forEach((h, i) => {
    const key = HEADER_MAP[h];
    if (key && colIndex[key] === undefined) colIndex[key] = i;
  });

  if (colIndex.FullName === undefined || colIndex.Email === undefined) {
    result.errors.push({
      rowNumber: 0,
      fullName: '',
      email: '',
      error: 'CSV must contain "Full Name" and "Email" columns',
    });
    return result;
  }

  const seenInFile = new Set<string>();

  raw.slice(1).forEach((cells, idx) => {
    const rowNumber = idx + 1;
    const get = (key: keyof Omit<CsvUserRow, 'rowNumber'>) => {
      const i = colIndex[key];
      return i === undefined ? '' : (cells[i] ?? '').trim();
    };

    const fullName = get('FullName');
    const email = get('Email').toLowerCase();
    const role = get('Role') || 'Stakeholder';
    const managerEmail = get('ManagerEmail').toLowerCase();
    const teamName = get('TeamName');
    const password = get('Password') || 'temp123';

    const fail = (error: string) =>
      result.errors.push({ rowNumber, fullName, email, error });

    if (!fullName || !email) return fail('Missing Full Name or Email');
    if (!EMAIL_RE.test(email)) return fail('Invalid email format');
    if (existingEmails.has(email)) return fail('Email already exists in the system');
    if (seenInFile.has(email)) return fail('Duplicate email within this file');
    if (!VALID_ROLES.includes(role as (typeof VALID_ROLES)[number]))
      return fail(`Invalid role "${role}" (use Admin, Stakeholder or Sub-stakeholder)`);
    if (password.length < 6) return fail('Password must be at least 6 characters');
    if (role === 'Sub-stakeholder' && managerEmail && !EMAIL_RE.test(managerEmail))
      return fail('Invalid manager email format');

    seenInFile.add(email);
    result.valid.push({
      rowNumber,
      FullName: fullName,
      Email: email,
      Role: role,
      ManagerEmail: managerEmail,
      TeamName: teamName,
      Password: password,
    });
  });

  return result;
}

/** Download a sample CSV template so admins get the headers right. */
export function downloadCsvTemplate() {
  const sample = [
    'Full Name,Email,Role,Manager Email,Team Name,Password',
    'Jane Doe,jane.doe@example.com,Stakeholder,,Engineering,changeme1',
    'Raj Kumar,raj.kumar@example.com,Sub-stakeholder,jane.doe@example.com,Engineering,changeme2',
  ].join('\r\n');

  const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'user-upload-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}