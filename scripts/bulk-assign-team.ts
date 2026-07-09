/**
 * scripts/bulk-assign-team.ts
 *
 * ONE-TIME SCRIPT: Bulk-assign existing users to a team based on their MANAGER,
 * with exceptions:
 *   - Role contains "leader" (e.g. "Team Leader") -> user's team is their OWN existing
 *     Team value (not overwritten by their manager). Still synced to Firestore + Sheets.
 *   - Role === "Admin" -> user is SKIPPED entirely; never gets a team assignment.
 *   - If the manager chain reaches an Admin who has no Team of their own, that's
 *     treated as a hard stop: the original user is SKIPPED (not an error), matching
 *     how direct Admins are treated. We don't keep walking further up past an Admin.
 *   - If the resolved team is literally "Admin", the user is skipped too (nobody
 *     gets auto-assigned into the Admin team).
 *
 * ---------------------------------------------------------------------------
 * DATA SOURCES (IMPORTANT — this is the part that changed):
 * ---------------------------------------------------------------------------
 *   - CSV  = source of truth for Name / ManagerMail / Role / Team. This is the
 *            full roster export (Name, Email, ManagerMail, Role, Team) — it is
 *            what drives the manager-chain resolution logic below. Team here is
 *            a TeamName string, same as before.
 *   - SHEETS ("users" tab) = used ONLY for two things:
 *       1) Finding the live row for a given Email, so we know where to write
 *          TeamID/TeamName back to.
 *       2) Building a TeamName -> TeamID lookup table, from whichever existing
 *          rows already have BOTH a TeamID and a TeamName populated. The CSV
 *          has no TeamID column, so this is the only place TeamID comes from
 *          for teams that aren't in the hardcoded KNOWN_TEAM_NAME_TO_ID map below.
 *   - KNOWN_TEAM_NAME_TO_ID = a hardcoded, confirmed TeamName -> TeamID mapping
 *          (see CONFIG section). This takes precedence over whatever is derived
 *          from the Sheet, and fills in any teams the Sheet-derived lookup would
 *          otherwise miss (e.g. because no Sheet row happens to have both TeamID
 *          and TeamName populated for that team). If the Sheet disagrees with
 *          this hardcoded map for a given team name, a warning is logged and the
 *          hardcoded value wins.
 *     We do NOT use the Sheet's Role/ManagerEmail columns for resolution logic
 *     anymore — those come from the CSV. The Sheet's own Role/ManagerEmail
 *     columns are read but ignored for that purpose (kept in the fetched range
 *     only because they sit between Email and TeamID in the live sheet).
 *
 * Live "users" sheet layout (confirmed from SERVER_HEADERS in googleSheetsService.ts), columns A:R:
 *   A=UserID, B=FullName, C=Email, D=Role, E=ManagerEmail, F=TeamID, G=TeamName,
 *   H=Active, I=CanCreateFollowUp, J=CanCloseTask, K=CreatedAt, L=UpdatedAt,
 *   M=Password, N=ApprovalStatus, O=RequestedBy, P=RequestedAt, Q=ApprovedBy, R=ApprovedAt
 *   We fetch all columns but only use A, C, F, G for this script.
 *
 * CSV layout required:
 *   Name,Email,ManagerMail,Role,Team
 *   Aman Dubey,aman@pw.live,rajeev.1@pw.live,Team Leader,Expansion - Aman
 *   ...
 *   - Rows with a blank or "#N/A" Email are treated as garbage and skipped.
 *   - Duplicate Email rows are merged (first row wins as the "target" record;
 *     blank fields are filled in from later duplicates) and logged as a warning.
 *   - Every unique, valid email in the CSV is a row to process (the CSV is now
 *     both the target list AND the source of Role/ManagerMail/Team data).
 *   - If a Team cell contains multiple comma-separated team names (e.g.
 *     "Business Excellence,Travel Desk,Software Purchase"), the FIRST listed
 *     team is used as that person's primary team — and anyone below them in
 *     the manager chain who resolves up to them inherits that same primary
 *     team. A warning is logged for every such row.
 *
 * Resolution: for a non-Leader, non-Admin user, we walk up the ManagerMail chain
 * (memoized, cycle-safe, using CSV data) until we hit:
 *   - a Leader (their own Team is used), or
 *   - someone who already has a non-blank Team, or
 *   - an Admin with no Team (hard stop -> skipped), or
 *   - a dead end (blank ManagerMail, missing manager row, or a cycle) -> error.
 *
 * Once a TeamName is resolved, we look it up in the combined
 * TeamName -> TeamID map (KNOWN_TEAM_NAME_TO_ID merged over the Sheet-derived
 * map). If no TeamID exists yet for that TeamName anywhere, the row is reported
 * as an error (not silently written with a blank TeamID) — add the TeamID to
 * KNOWN_TEAM_NAME_TO_ID (or add a row with that TeamID/TeamName pair to the
 * Sheet), then re-run.
 *
 * NOTE: This schema has no per-user "sub-team" field — sub-team membership lives in a
 * separate sub_teams sheet (SubTeamID, TeamID, SubTeamName, Active, ...leader emails).
 * If you need sub-team assignment too, tell me how sub-team membership should be
 * represented and I'll add it as a separate step.
 *
 * Usage:
 *   npx ts-node -r dotenv/config scripts/bulk-assign-team.ts ./data/team-assignments.csv --dry-run
 *   npx ts-node -r dotenv/config scripts/bulk-assign-team.ts ./data/team-assignments.csv --execute
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
const USERS_COLLECTION = "users";
const BATCH_LIMIT = 500;
const ADMIN_ROLE = "admin";
const LEADER_ROLE = "leader";
const ADMIN_TEAM_NAME = "admin"; // lowercase compare
const SHEET_RANGE = "users!A:R"; // Full user row: UserID,FullName,Email,Role,ManagerEmail,TeamID,TeamName,Active,CanCreateFollowUp,CanCloseTask,CreatedAt,UpdatedAt,Password,ApprovalStatus,RequestedBy,RequestedAt,ApprovedBy,ApprovedAt

/**
 * Confirmed TeamName -> TeamID mapping, provided directly (not derived from the
 * Sheet). Keys are lowercase for case-insensitive lookup. This takes precedence
 * over the Sheet-derived TeamName -> TeamID map built in buildSheetIndex(), and
 * fills in any team whose Sheet rows don't happen to have both TeamID and
 * TeamName populated together.
 *
 * Update this list if new teams are created or a TeamID changes.
 */
const KNOWN_TEAM_NAME_TO_ID: Record<string, string> = {
  "administration": "T-125",
  "e-com warehouse": "T-180",
  "software purchase": "T-230",
  "expansion - akshay": "T-263",
  "supply chain management": "T-267",
  "expansion-school": "T-3",
  "expansion - aman": "T-476",
  "travel desk": "T-5",
  "e-com": "T-6",
  "expansion": "T-698",
  "business excellence": "T-7",
  "infra office/corparate": "T-706",
  "atl/btl marketing": "T-739",
  "global management": "T-ALL",
};

// ---------------------------------------------------------------------------
// Firebase init (Firestore)
// ---------------------------------------------------------------------------
function getDb() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  const missing: string[] = [];
  if (!projectId) missing.push("FIREBASE_PROJECT_ID");
  if (!clientEmail) missing.push("FIREBASE_ADMIN_CLIENT_EMAIL");
  if (!privateKey) missing.push("FIREBASE_ADMIN_PRIVATE_KEY");
  if (missing.length > 0) {
    console.error(`Missing Firebase env vars: ${missing.join(", ")}`);
    process.exit(1);
  }

  const formattedPrivateKey = privateKey!.replace(/\\n/g, "\n");
  if (!getApps().length) {
    initializeApp({
      credential: cert({ projectId: projectId!, clientEmail: clientEmail!, privateKey: formattedPrivateKey }),
    });
  }
  return getFirestore();
}

// ---------------------------------------------------------------------------
// Google Sheets auth + helpers — mirrors server/services/googleSheetsService.ts
// ---------------------------------------------------------------------------
interface SheetsToken {
  accessToken: string;
  spreadsheetId: string;
}

async function generateGoogleSheetsToken(): Promise<SheetsToken> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.trim();
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID?.trim();

  const missing: string[] = [];
  if (!email) missing.push("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  if (!privateKey) missing.push("GOOGLE_PRIVATE_KEY");
  if (!spreadsheetId) missing.push("GOOGLE_SPREADSHEET_ID");
  if (missing.length > 0) {
    console.error(`Missing Google Sheets env vars: ${missing.join(", ")}`);
    process.exit(1);
  }

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  const claims = {
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file",
    aud: "https://oauth2.googleapis.com/token",
    exp,
    iat,
  };
  const header = { alg: "RS256", typ: "JWT" };
  const b64Header = Buffer.from(JSON.stringify(header)).toString("base64url");
  const b64Payload = Buffer.from(JSON.stringify(claims)).toString("base64url");

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(`${b64Header}.${b64Payload}`);
  const formattedKey = privateKey!.replace(/\\n/g, "\n");
  const signature = sign.sign(formattedKey, "base64url");
  const jwt = `${b64Header}.${b64Payload}.${signature}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error(`Google SA token fetch failed (HTTP ${tokenRes.status}): ${errText}`);
    process.exit(1);
  }

  const tokenData = await tokenRes.json();
  return { accessToken: tokenData.access_token, spreadsheetId: spreadsheetId! };
}

async function fetchSheetValues(accessToken: string, spreadsheetId: string, range: string): Promise<string[][]> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueRenderOption=FORMATTED_VALUE`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    console.error(`fetchSheetValues failed for range ${range}: HTTP ${res.status}`);
    return [];
  }
  const data = await res.json();
  return data.values || [];
}

async function updateSheetValues(
  accessToken: string,
  spreadsheetId: string,
  range: string,
  values: any[][]
): Promise<boolean> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    console.error(`updateSheetValues failed for range ${range}: HTTP ${res.status} - ${errText}`);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type RowStatus = "updated" | "skipped" | "error";

interface RowResult {
  email: string;
  team?: string;
  teamId?: string;
  status: RowStatus;
  reason?: string;
}

/** A row from the CSV — this is the source of truth for hierarchy/role/team data. */
interface CsvUserRecord {
  rowIndex: number; // 0-based position among valid CSV rows, for logging only
  name: string;
  email: string;
  managerMail: string;
  role: string;
  team: string;
}

/** A row from the live "users" Sheet — used only to locate a row + existing TeamID/TeamName. */
interface SheetUserRecord {
  rowIndex: number; // 0-based index within the fetched sheet rows (row 0 = header)
  userId: string;
  email: string;
  teamId: string;
  teamName: string;
}

// ---------------------------------------------------------------------------
// CSV loading (source of truth for Name/ManagerMail/Role/Team)
// ---------------------------------------------------------------------------
function isBlankOrNA(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === "" || v === "#n/a";
}

/**
 * A CSV "Team" cell can occasionally contain multiple comma-separated team
 * names (e.g. someone split across teams, like "Business Excellence,Travel
 * Desk,Software Purchase"). We only support a single primary team per user,
 * so we take the FIRST listed team as authoritative — this applies both to
 * that person's own assignment AND to anyone whose manager chain resolves up
 * through them (they inherit the same primary team). A warning is logged so
 * multi-team cells can be reviewed/cleaned up in the source CSV if that's not
 * the desired outcome for a given person.
 */
function parsePrimaryTeam(rawTeam: string, contextEmail: string): string {
  const trimmed = rawTeam.trim();
  if (!trimmed.includes(",")) return trimmed;

  const parts = trimmed
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const primary = parts[0] || "";
  console.log(
    `WARNING: ${contextEmail || "(unknown email)"} has multiple comma-separated teams in CSV ("${trimmed}") — using "${primary}" as the primary team.`
  );
  return primary;
}

function loadCsv(filePath: string): { name: string; email: string; managerMail: string; role: string; team: string }[] {
  const raw = fs.readFileSync(filePath, "utf-8");
  const records = parse(raw, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];

  if (records.length === 0) return [];

  // Case-insensitive header lookup so we don't care about exact casing/spacing.
  const headers = Object.keys(records[0]);
  const nameHeader = headers.find((h) => h.trim().toLowerCase() === "name");
  const emailHeader = headers.find((h) => h.trim().toLowerCase() === "email");
  const managerHeader = headers.find((h) => h.trim().toLowerCase() === "managermail");
  const roleHeader = headers.find((h) => h.trim().toLowerCase() === "role");
  const teamHeader = headers.find((h) => h.trim().toLowerCase() === "team");

  if (!emailHeader) {
    console.error(`CSV is missing an "Email" column. Found columns: ${headers.join(", ") || "(none)"}`);
    process.exit(1);
  }
  const missingOptional: string[] = [];
  if (!managerHeader) missingOptional.push("ManagerMail");
  if (!roleHeader) missingOptional.push("Role");
  if (!teamHeader) missingOptional.push("Team");
  if (missingOptional.length > 0) {
    console.log(
      `WARNING: CSV is missing column(s): ${missingOptional.join(
        ", "
      )}. Resolution logic depends on these — most rows will likely fail to resolve.\n`
    );
  }

  return records.map((r) => {
    const rawEmail = (r[emailHeader] || "").toLowerCase().trim();
    const rawTeam = teamHeader ? (r[teamHeader] || "").trim() : "";
    return {
      name: nameHeader ? (r[nameHeader] || "").trim() : "",
      email: rawEmail,
      managerMail: managerHeader && !isBlankOrNA(r[managerHeader] || "") ? (r[managerHeader] || "").toLowerCase().trim() : "",
      role: roleHeader ? (r[roleHeader] || "").trim() : "",
      team: rawTeam ? parsePrimaryTeam(rawTeam, rawEmail) : rawTeam,
    };
  });
}

/**
 * Builds the email -> CsvUserRecord index from raw CSV rows.
 * - Skips garbage rows where Email itself is blank or "#N/A".
 * - Merges duplicate emails: keeps the FIRST row's data as the base, but fills
 *   in ManagerMail/Role/Team from whichever duplicate row has a non-blank
 *   value first. Logs a warning for every duplicate so it can be cleaned up
 *   in the source CSV.
 */
function buildCsvIndex(
  csvRows: { name: string; email: string; managerMail: string; role: string; team: string }[]
): { byEmail: Map<string, CsvUserRecord>; orderedEmails: string[]; duplicateEmails: string[]; skippedInvalidRows: number } {
  const byEmail = new Map<string, CsvUserRecord>();
  const orderedEmails: string[] = [];
  const duplicateEmails: string[] = [];
  let skippedInvalidRows = 0;
  let idx = 0;

  for (const row of csvRows) {
    if (isBlankOrNA(row.email)) {
      skippedInvalidRows++;
      continue;
    }

    const record: CsvUserRecord = {
      rowIndex: idx,
      name: row.name,
      email: row.email,
      managerMail: row.managerMail,
      role: row.role,
      team: row.team,
    };

    const existing = byEmail.get(row.email);
    if (!existing) {
      byEmail.set(row.email, record);
      orderedEmails.push(row.email);
      idx++;
      continue;
    }

    duplicateEmails.push(row.email);
    byEmail.set(row.email, {
      rowIndex: existing.rowIndex,
      name: existing.name || record.name,
      email: row.email,
      managerMail: existing.managerMail || record.managerMail,
      role: existing.role || record.role,
      team: existing.team || record.team,
    });
  }

  return { byEmail, orderedEmails, duplicateEmails, skippedInvalidRows };
}

// ---------------------------------------------------------------------------
// Sheets loading (source of Email -> row + TeamName -> TeamID lookup ONLY)
// ---------------------------------------------------------------------------
function buildSheetIndex(sheetRows: string[][]): {
  byEmail: Map<string, SheetUserRecord>;
  teamNameToId: Map<string, string>;
  teamNameConflicts: { teamName: string; ids: string[] }[];
} {
  const byEmail = new Map<string, SheetUserRecord>();
  const teamNameToId = new Map<string, string>();
  const teamNameConflictsMap = new Map<string, Set<string>>();

  for (let i = 1; i < sheetRows.length; i++) {
    const row = sheetRows[i];
    const userId = row[0];
    const email = row[2];
    const teamId = row[5];
    const teamName = row[6];
    // Columns: 0 UserID, 1 FullName, 2 Email, 3 Role, 4 ManagerEmail, 5 TeamID, 6 TeamName, 7 Active, ... (rest ignored)
    const normEmail = (email || "").toLowerCase().trim();
    if (isBlankOrNA(normEmail)) continue;

    byEmail.set(normEmail, {
      rowIndex: i,
      userId: (userId || "").trim(),
      email: normEmail,
      teamId: (teamId || "").trim(),
      teamName: (teamName || "").trim(),
    });

    const normTeamId = (teamId || "").trim();
    const normTeamName = (teamName || "").trim();
    if (normTeamId && normTeamName) {
      const key = normTeamName.toLowerCase();
      if (!teamNameToId.has(key)) {
        teamNameToId.set(key, normTeamId);
      }
      if (!teamNameConflictsMap.has(key)) teamNameConflictsMap.set(key, new Set());
      teamNameConflictsMap.get(key)!.add(normTeamId);
    }
  }

  const teamNameConflicts = Array.from(teamNameConflictsMap.entries())
    .filter(([, ids]) => ids.size > 1)
    .map(([teamName, ids]) => ({ teamName, ids: Array.from(ids) }));

  return { byEmail, teamNameToId, teamNameConflicts };
}

/**
 * Merges KNOWN_TEAM_NAME_TO_ID over a Sheet-derived TeamName -> TeamID map.
 * The known/hardcoded map always wins on conflict (logged as a warning), and
 * fills in any team name the Sheet-derived map doesn't have at all.
 * Returns a NEW map; does not mutate the input.
 */
function mergeKnownTeamIds(sheetDerived: Map<string, string>): Map<string, string> {
  const merged = new Map(sheetDerived);

  for (const [rawName, id] of Object.entries(KNOWN_TEAM_NAME_TO_ID)) {
    const key = rawName.toLowerCase().trim();
    const existing = merged.get(key);
    if (existing && existing !== id) {
      console.log(
        `WARNING: known TeamID mapping for "${rawName}" (${id}) differs from Sheet-derived TeamID (${existing}). Using known mapping (${id}).`
      );
    }
    merged.set(key, id);
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Manager-chain team resolution (operates over CSV data)
// ---------------------------------------------------------------------------
interface ResolutionSuccess {
  ok: true;
  team: string;
  via: "own" | "leader-own" | "manager-chain";
}
interface ResolutionFailure {
  ok: false;
  reason: string;
  /** true when this failure represents an intentional hard-stop (e.g. hit an Admin
   *  in the chain) rather than a data problem that needs fixing. Propagated to RowResult
   *  as status "skipped" instead of "error". */
  skip?: boolean;
}
type ResolutionOutcome = ResolutionSuccess | ResolutionFailure;

function isFailure(outcome: ResolutionOutcome): outcome is ResolutionFailure {
  return outcome.ok === false;
}

/** Matches "Leader", "Team Leader", "Sub-Team Leader", etc. — anything containing "leader". */
function isLeaderRole(roleLower: string): boolean {
  return roleLower.includes(LEADER_ROLE);
}

/**
 * Resolves the TeamName for a single user by walking up the ManagerMail chain,
 * using the CSV-derived index (byEmail) exclusively.
 * - Admin role -> caller should skip before calling this (handled in main loop).
 * - Leader role -> returns their own existing Team value.
 * - Otherwise -> follow ManagerMail until we find a Leader or someone with a
 *   non-blank Team. Cycle-safe via `visiting`. Memoized via `cache`.
 */
function resolveTeam(
  email: string,
  byEmail: Map<string, CsvUserRecord>,
  cache: Map<string, ResolutionOutcome>,
  visiting: Set<string>
): ResolutionOutcome {
  const cached = cache.get(email);
  if (cached) return cached;

  const user = byEmail.get(email);
  if (!user) {
    const outcome: ResolutionOutcome = { ok: false, reason: `Manager not found in CSV: ${email}` };
    cache.set(email, outcome);
    return outcome;
  }

  if (visiting.has(email)) {
    const outcome: ResolutionOutcome = {
      ok: false,
      reason: `Manager chain cycle detected involving: ${email}`,
    };
    cache.set(email, outcome);
    return outcome;
  }

  const role = user.role.trim().toLowerCase();

  if (role === ADMIN_ROLE) {
    const outcome: ResolutionOutcome = {
      ok: false,
      skip: true,
      reason: `${email} has Admin role — treated as a hard stop; anyone whose chain reaches an Admin with no team of their own is skipped, not auto-assigned`,
    };
    cache.set(email, outcome);
    return outcome;
  }

  if (isLeaderRole(role)) {
    if (!user.team) {
      const outcome: ResolutionOutcome = {
        ok: false,
        reason: `Leader ${email} has no existing Team value set in the CSV`,
      };
      cache.set(email, outcome);
      return outcome;
    }
    const outcome: ResolutionOutcome = { ok: true, team: user.team, via: "leader-own" };
    cache.set(email, outcome);
    return outcome;
  }

  if (user.team) {
    const outcome: ResolutionOutcome = { ok: true, team: user.team, via: "own" };
    cache.set(email, outcome);
    return outcome;
  }

  if (!user.managerMail) {
    const outcome: ResolutionOutcome = {
      ok: false,
      reason: `No ManagerMail set for ${email} and no existing Team to fall back on`,
    };
    cache.set(email, outcome);
    return outcome;
  }

  visiting.add(email);
  const managerOutcome = resolveTeam(user.managerMail, byEmail, cache, visiting);
  visiting.delete(email);

  if (isFailure(managerOutcome)) {
    const outcome: ResolutionOutcome = {
      ok: false,
      skip: managerOutcome.skip,
      reason: `Could not resolve via manager ${user.managerMail}: ${managerOutcome.reason}`,
    };
    cache.set(email, outcome);
    return outcome;
  }

  const outcome: ResolutionOutcome = { ok: true, team: managerOutcome.team, via: "manager-chain" };
  cache.set(email, outcome);
  return outcome;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const csvPath = args.find((a) => !a.startsWith("--"));
  const execute = args.includes("--execute");
  const dryRun = !execute;

  if (!csvPath) {
    console.error("Usage: npx ts-node scripts/bulk-assign-team.ts <path-to-csv> [--dry-run | --execute]");
    process.exit(1);
  }
  const absPath = path.resolve(csvPath);
  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  const db = getDb();
  const { accessToken, spreadsheetId } = await generateGoogleSheetsToken();

  // --- Load CSV: source of truth for Name/ManagerMail/Role/Team ---
  console.log(`\nLoading CSV: ${absPath}`);
  const csvRows = loadCsv(absPath);
  console.log(`Found ${csvRows.length} CSV rows.`);

  const { byEmail: csvByEmail, orderedEmails, duplicateEmails, skippedInvalidRows } = buildCsvIndex(csvRows);
  console.log(`Loaded ${csvByEmail.size} unique valid user rows from CSV.`);
  if (skippedInvalidRows > 0) {
    console.log(`Skipped ${skippedInvalidRows} invalid CSV row(s) (blank or "#N/A" email).`);
  }
  if (duplicateEmails.length > 0) {
    console.log(
      `WARNING: ${duplicateEmails.length} duplicate email row(s) found and merged in CSV (first row wins): ${duplicateEmails.join(
        ", "
      )}`
    );
    console.log(`Consider cleaning up these duplicates in the source CSV.\n`);
  } else {
    console.log("");
  }

  // --- Fetch Sheets: used ONLY for Email -> row lookup + TeamName -> TeamID lookup ---
  console.log("Fetching users sheet (for email matching + TeamID lookup only)...");
  const sheetRows = await fetchSheetValues(accessToken, spreadsheetId, SHEET_RANGE);

  console.log(`DEBUG header row (${SHEET_RANGE}) from Sheets: ${JSON.stringify(sheetRows[0] || [])}`);
  console.log(`DEBUG first data row (${SHEET_RANGE}) from Sheets: ${JSON.stringify(sheetRows[1] || [])}`);

  const { byEmail: sheetByEmail, teamNameToId: sheetTeamNameToId, teamNameConflicts } = buildSheetIndex(sheetRows);
  console.log(`Loaded ${sheetByEmail.size} user rows from Sheets.`);
  console.log(`Built Sheet-derived TeamName -> TeamID lookup with ${sheetTeamNameToId.size} team(s).`);
  if (teamNameConflicts.length > 0) {
    console.log(`WARNING: ${teamNameConflicts.length} TeamName(s) map to more than one TeamID in the Sheet (first TeamID seen wins):`);
    teamNameConflicts.forEach((c) => console.log(`  - "${c.teamName}": ${c.ids.join(", ")}`));
  }

  // Merge the hardcoded, confirmed mapping on top of whatever the Sheet gave us.
  const teamNameToId = mergeKnownTeamIds(sheetTeamNameToId);
  console.log(`Merged with ${Object.keys(KNOWN_TEAM_NAME_TO_ID).length} known team mapping(s) -> ${teamNameToId.size} team(s) total.\n`);

  // --- Resolve every unique CSV email ---
  const results: RowResult[] = [];
  const resolved: { email: string; team: string; teamId: string }[] = [];
  const cache = new Map<string, ResolutionOutcome>();

  for (const email of orderedEmails) {
    const user = csvByEmail.get(email)!;
    const role = user.role.trim().toLowerCase();

    if (role === ADMIN_ROLE) {
      results.push({ email, status: "skipped", reason: "Admin role — not assigned to a team" });
      continue;
    }

    const outcome = resolveTeam(email, csvByEmail, cache, new Set());

    if (isFailure(outcome)) {
      results.push({
        email,
        status: outcome.skip ? "skipped" : "error",
        reason: outcome.reason,
      });
      continue;
    }

    if (outcome.team.trim().toLowerCase() === ADMIN_TEAM_NAME) {
      results.push({
        email,
        team: outcome.team,
        status: "skipped",
        reason: `Resolved team is "${outcome.team}" — users are never auto-assigned to the Admin team`,
      });
      continue;
    }

    const sheetUser = sheetByEmail.get(email);
    if (!sheetUser) {
      results.push({
        email,
        team: outcome.team,
        status: "error",
        reason: "Email not found in Sheets — no matching row to write TeamID/TeamName to",
      });
      continue;
    }

    const teamId = teamNameToId.get(outcome.team.trim().toLowerCase());
    if (!teamId) {
      results.push({
        email,
        team: outcome.team,
        status: "error",
        reason: `No TeamID found for team "${outcome.team}" — add it to KNOWN_TEAM_NAME_TO_ID (or add a row with that TeamID/TeamName pair to the Sheet), then re-run`,
      });
      continue;
    }

    resolved.push({ email, team: outcome.team, teamId });
  }

  console.log(`Resolved and ready: ${resolved.length}`);
  console.log(`Skipped: ${results.filter((r) => r.status === "skipped").length}`);
  console.log(`Errors: ${results.filter((r) => r.status === "error").length}\n`);

  if (dryRun) {
    console.log("--- DRY RUN: no writes will be made ---\n");
    for (const r of resolved) {
      console.log(`Would update ${r.email} -> Team=${r.team} (TeamID=${r.teamId})`);
    }
    if (results.length) {
      console.log("\nSkipped / errors:");
      for (const r of results) {
        console.log(`  - ${r.email}: [${r.status}] ${r.reason}`);
      }
    }
    console.log(`\nRe-run with --execute to write to Firestore + Sheets for real.\n`);
    process.exit(0);
  }

  const now = new Date().toISOString();

  // --- Firestore writes (batched) ---
  console.log("Writing to Firestore...");
  const fsChunks = chunk(resolved, BATCH_LIMIT);
  for (const group of fsChunks) {
    const batch = db.batch();
    for (const r of group) {
      const ref = db.collection(USERS_COLLECTION).doc(r.email);
      batch.update(ref, {
        TeamIDs: [r.teamId],
        TeamNames: [r.team],
        UpdatedAt: now, // Firestore-only bookkeeping field; no corresponding sheet column
      });
    }
    await batch.commit();
    console.log(`  Firestore: committed batch of ${group.length}.`);
  }

  // --- Sheets writes (columns F:G = TeamID, TeamName — one row at a time) ---
  console.log("\nWriting to Google Sheets...");
  let sheetsUpdated = 0;
  for (const r of resolved) {
    const sheetUser = sheetByEmail.get(r.email)!;
    const sheetRow = sheetUser.rowIndex + 1; // A1 notation is 1-indexed
    const ok = await updateSheetValues(accessToken, spreadsheetId, `users!F${sheetRow}:G${sheetRow}`, [
      [r.teamId, r.team],
    ]);
    if (ok) {
      sheetsUpdated++;
      results.push({ email: r.email, team: r.team, teamId: r.teamId, status: "updated" });
    } else {
      results.push({ email: r.email, team: r.team, teamId: r.teamId, status: "error", reason: "Sheets update failed" });
    }
  }
  console.log(`  Sheets: updated ${sheetsUpdated} rows.\n`);

  const updated = results.filter((r) => r.status === "updated").length;
  const skipped = results.filter((r) => r.status === "skipped");
  const errors = results.filter((r) => r.status === "error");

  console.log("=== SUMMARY ===");
  console.log(`Total CSV rows processed: ${csvRows.length}`);
  console.log(`Updated (Firestore + Sheets): ${updated}`);
  console.log(`Skipped: ${skipped.length}`);
  console.log(`Errors: ${errors.length}`);
  if (skipped.length) {
    console.log("\nSkipped rows:");
    skipped.forEach((s) => console.log(`  - ${s.email}: ${s.reason}`));
  }
  if (errors.length) {
    console.log("\nFailed rows:");
    errors.forEach((e) => console.log(`  - ${e.email}: ${e.reason}`));
  }

  const reportPath = path.join(path.dirname(absPath), `assignment-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nDetailed report written to: ${reportPath}\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});