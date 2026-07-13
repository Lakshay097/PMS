import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { firestoreAdmin } from './services/firebaseAdmin';
import { logger } from './utils/logger';

// Inline Google Sheets functions to avoid config module issues
async function generateGoogleSheetsToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.trim();
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID?.trim();

  if (!email || !privateKey) {
    logger.error("Google Service Account credentials not provided in environment.");
    return null;
  }

  const formattedKey = privateKey.replace(/\\n/g, "\n");
  if (!formattedKey.includes('-----BEGIN PRIVATE KEY-----')) {
    logger.error("GOOGLE_PRIVATE_KEY does not appear to be a valid PEM key.");
  }

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  const claims = {
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file",
    aud: "https://oauth2.googleapis.com/token",
    exp,
    iat
  };

  const header = { alg: "RS256", typ: "JWT" };
  const base64UrlHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const base64UrlPayload = Buffer.from(JSON.stringify(claims)).toString("base64url");

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(`${base64UrlHeader}.${base64UrlPayload}`);
  const signature = sign.sign(formattedKey).toString("base64url");

  const jwt = `${base64UrlHeader}.${base64UrlPayload}.${signature}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });

  if (!tokenRes.ok) {
    const errorText = await tokenRes.text();
    logger.error(`Google SA Token fetch failed (HTTP ${tokenRes.status}):`, errorText);
    return null;
  }

  const tokenData = await tokenRes.json();
  return {
    accessToken: tokenData.access_token,
    spreadsheetId: spreadsheetId || null,
    expiresIn: tokenData.expires_in,
    serviceAccountActive: true
  };
}

async function fetchSheetValues(accessToken: string, spreadsheetId: string, range: string) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    logger.error(`Failed to fetch sheet range ${range}:`, await res.text());
    return null;
  }

  const data = await res.json();
  return data.values || [];
}

// Helper to query settings from Google Sheets
function getSettingValue(rows: any[][] | null, key: string, defaultValue: string): string {
  if (!rows) return defaultValue;
  const row = rows.find(r => r[0] === key);
  return row && row[1] !== undefined && row[1] !== null ? String(row[1]) : defaultValue;
}

// Get team leader emails from settings sheet
function getTeamLeaderEmails(settingsRows: any[][], teamId: string): string[] {
  const leaderSettingKey = `team_${teamId}_leaders`;
  const leaderEmailsStr = getSettingValue(settingsRows, leaderSettingKey, '');
  if (!leaderEmailsStr) return [];
  return leaderEmailsStr.split(',').map(e => e.trim()).filter(Boolean);
}

// Get team stakeholder emails from settings sheet
function getTeamStakeholderEmails(settingsRows: any[][], teamId: string): string[] {
  const stakeholderSettingKey = `team_${teamId}_stakeholders`;
  const stakeholderEmailsStr = getSettingValue(settingsRows, stakeholderSettingKey, '');
  if (!stakeholderEmailsStr) return [];
  return stakeholderEmailsStr.split(',').map(e => e.trim()).filter(Boolean);
}

// Get sub-team leader emails from settings sheet
function getSubTeamLeaderEmails(settingsRows: any[][], teamId: string, subTeamId: string): string[] {
  const leaderSettingKey = `team_${teamId}_subteam_${subTeamId}_leaders`;
  const leaderEmailsStr = getSettingValue(settingsRows, leaderSettingKey, '');
  if (!leaderEmailsStr) return [];
  return leaderEmailsStr.split(',').map(e => e.trim()).filter(Boolean);
}

async function verifyRecipientResolution() {
  try {
    console.log('=== Verifying Recipient Resolution ===\n');

    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData) {
      console.error('❌ Failed to generate Google Sheets token');
      return;
    }

    const accessToken = tokenData.accessToken;
    const spreadsheetId = tokenData.spreadsheetId;
    
    if (!spreadsheetId) {
      console.error('❌ Spreadsheet ID not found in token response');
      return;
    }

    const settingsRows = await fetchSheetValues(accessToken, spreadsheetId, 'settings!A:B');
    
    if (!settingsRows) {
      console.error('❌ Failed to fetch settings sheet');
      return;
    }

    console.log('✅ Settings sheet fetched successfully\n');

    // Fetch all teams from Firestore
    const teamsSnapshot = await firestoreAdmin.collection('teams').get();
    const teams: any[] = [];
    
    teamsSnapshot.forEach(doc => {
      const team = doc.data();
      teams.push({
        teamId: doc.id,
        teamName: team.TeamName,
        active: team.Active !== false,
      });
    });

    console.log(`Found ${teams.length} teams in Firestore\n`);

    // Display all teams with their recipient details from settings
    console.log('=== Team-Level Recipients (from Settings) ===');
    console.log('================================');
    teams.forEach(team => {
      const leaderEmails = getTeamLeaderEmails(settingsRows, team.teamId);
      const stakeholderEmails = getTeamStakeholderEmails(settingsRows, team.teamId);
      const allRecipients = [...new Set([...leaderEmails, ...stakeholderEmails])];
      
      console.log(`\n${team.teamName} (${team.teamId})`);
      console.log(`  Active: ${team.active}`);
      console.log(`  Team Leaders (${leaderEmails.length}):`);
      if (leaderEmails.length > 0) {
        leaderEmails.forEach((email: string) => console.log(`    - ${email}`));
      } else {
        console.log('    (none)');
      }
      
      console.log(`  Stakeholders (${stakeholderEmails.length}):`);
      if (stakeholderEmails.length > 0) {
        stakeholderEmails.forEach((email: string) => console.log(`    - ${email}`));
      } else {
        console.log('    (none)');
      }
      
      console.log(`  Total Recipients: ${allRecipients.length}`);
      if (allRecipients.length > 0) {
        console.log(`  Resolved Recipients: ${allRecipients.join(', ')}`);
      }
    });

    // Fetch sub-teams under E-Com
    console.log('\n\n=== Sub-Team-Level Recipients (from Settings) ===');
    console.log('================================');
    const eComSnapshot = await firestoreAdmin.collection('teams')
      .where('TeamName', '==', 'E-Com')
      .get();

    if (!eComSnapshot.empty) {
      const eComId = eComSnapshot.docs[0].id;
      const subTeamsSnapshot = await firestoreAdmin.collection('sub_teams')
        .where('TeamID', '==', eComId)
        .get();

      console.log(`Found ${subTeamsSnapshot.size} sub-teams under E-Com:\n`);

      subTeamsSnapshot.forEach(doc => {
        const subTeam = doc.data();
        const subTeamLeaderEmails = getSubTeamLeaderEmails(settingsRows, eComId, doc.id);
        
        console.log(`${subTeam.SubTeamName} (${doc.id})`);
        console.log(`  Parent Team ID: ${subTeam.TeamID}`);
        console.log(`  Sub-Team Leaders (${subTeamLeaderEmails.length}):`);
        if (subTeamLeaderEmails.length > 0) {
          subTeamLeaderEmails.forEach((email: string) => console.log(`    - ${email}`));
        } else {
          console.log('    (none)');
        }
        console.log(`  Total Recipients: ${subTeamLeaderEmails.length}`);
        if (subTeamLeaderEmails.length > 0) {
          console.log(`  Resolved Recipients: ${subTeamLeaderEmails.join(', ')}`);
        }
        console.log('');
      });
    } else {
      console.log('❌ E-Com team not found');
    }

    // Specific checks for the configured entities
    console.log('\n\n=== Specific Entity Checks ===');
    
    // Check Business Excellence (T-7)
    const businessTeam = teams.find(t => t.teamId === 'T-7');
    if (businessTeam) {
      const businessEmails = getTeamLeaderEmails(settingsRows, 'T-7');
      console.log('\n✅ Business Excellence (T-7) Found:');
      console.log(`  Team Leaders: ${businessEmails.join(', ') || '(none)'}`);
      console.log(`  Total Recipients: ${businessEmails.length}`);
      console.log(`  Resolved: ${businessEmails.join(', ')}`);
    }

    // Check Ecom SST sub-team
    if (!eComSnapshot.empty) {
      const eComId = eComSnapshot.docs[0].id;
      const subTeamsSnapshot = await firestoreAdmin.collection('sub_teams')
        .where('TeamID', '==', eComId)
        .where('SubTeamName', '==', 'Ecom SST')
        .get();

      if (!subTeamsSnapshot.empty) {
        const sstSubTeamId = subTeamsSnapshot.docs[0].id;
        const sstEmails = getSubTeamLeaderEmails(settingsRows, eComId, sstSubTeamId);
        console.log('\n✅ Ecom SST Sub-Team Found:');
        console.log(`  Sub-Team Leaders: ${sstEmails.join(', ') || '(none)'}`);
        console.log(`  Total Recipients: ${sstEmails.length}`);
        console.log(`  Resolved: ${sstEmails.join(', ')}`);
      } else {
        console.log('\n❌ Ecom SST Sub-Team NOT FOUND');
      }

      // Check Ecom Purchase sub-team
      const purchaseSubTeamsSnapshot = await firestoreAdmin.collection('sub_teams')
        .where('TeamID', '==', eComId)
        .where('SubTeamName', '==', 'Ecom Purchase')
        .get();

      if (!purchaseSubTeamsSnapshot.empty) {
        const purchaseSubTeamId = purchaseSubTeamsSnapshot.docs[0].id;
        const purchaseEmails = getSubTeamLeaderEmails(settingsRows, eComId, purchaseSubTeamId);
        console.log('\n✅ Ecom Purchase Sub-Team Found:');
        console.log(`  Sub-Team Leaders: ${purchaseEmails.join(', ') || '(none)'}`);
        console.log(`  Total Recipients: ${purchaseEmails.length}`);
        console.log(`  Resolved: ${purchaseEmails.join(', ')}`);
      } else {
        console.log('\n❌ Ecom Purchase Sub-Team NOT FOUND');
      }
    }

    console.log('\n=== Verification Complete ===');

  } catch (error) {
    console.error('Error in verifyRecipientResolution:', error);
    process.exit(1);
  }
}

verifyRecipientResolution()
  .then(() => {
    console.log('\nScript execution completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript execution failed:', error);
    process.exit(1);
  });
