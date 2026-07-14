import { generateGoogleSheetsToken, fetchSheetValues, appendSheetValues, updateSheetValues, createSheet } from './googleSheetsService';
import { logger } from '../utils/logger';

export interface TeamReportConfig {
  teamId: string;
  teamName: string;
  reminderDay: string; // e.g., "Monday", "Tuesday", etc.
  meetingDay: string; // e.g., "Monday", "Tuesday", etc.
  active: boolean;
  updatedAt: string;
  entityType?: 'team' | 'subteam';
  parentTeamId?: string;
}

/**
 * Initialize the team_report_config sheet with headers
 */
export async function initializeTeamReportConfigSheet(): Promise<boolean> {
  try {
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) return false;

    const spreadsheetId = tokenData.spreadsheetId;
    const existingValues = await fetchSheetValues(tokenData.accessToken, spreadsheetId, 'team_report_config!A1:E1');
    if (existingValues && existingValues.length > 0) return true;

    await createSheet(tokenData.accessToken, spreadsheetId, 'team_report_config');
    await appendSheetValues(tokenData.accessToken, spreadsheetId, 'team_report_config', [
      ['team_id', 'team_name', 'reminder_day', 'meeting_day', 'active', 'updated_at', 'entity_type', 'parent_team_id']
    ]);

    logger.info('Initialized team_report_config sheet');
    return true;
  } catch (err) {
    logger.error('Error initializing team_report_config sheet:', err);
    return false;
  }
}

/**
 * Get all team report configurations from Firestore
 */
export async function getTeamReportConfigs(): Promise<TeamReportConfig[]> {
  try {
    const { firestoreAdmin } = await import('./firebaseAdmin');
    const snapshot = await firestoreAdmin.collection('team_report_config').get();
    
    if (snapshot.empty) return [];

    const configs: TeamReportConfig[] = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.active !== false) {
        configs.push({
          teamId: data.teamId,
          teamName: data.teamName || '',
          reminderDay: data.reminderDay,
          meetingDay: data.meetingDay,
          active: data.active !== false,
          updatedAt: data.updatedAt || new Date().toISOString(),
          entityType: data.entityType || 'team',
          parentTeamId: data.parentTeamId || undefined,
        });
      }
    });

    return configs;
  } catch (err) {
    logger.error('Error getting team report configs:', err);
    return [];
  }
}

/**
 * Get a specific team's report configuration
 */
export async function getTeamReportConfig(teamId: string): Promise<TeamReportConfig | null> {
  const configs = await getTeamReportConfigs();
  return configs.find(c => c.teamId === teamId) || null;
}

/**
 * Save or update a team report configuration
 */
export async function saveTeamReportConfig(config: TeamReportConfig): Promise<boolean> {
  try {
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) return false;

    const spreadsheetId = tokenData.spreadsheetId;
    const values = await fetchSheetValues(tokenData.accessToken, spreadsheetId, 'team_report_config!A:H');
    if (!values) return false;

    const now = new Date().toISOString();
    let rowIndex = -1;
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === config.teamId) {
        rowIndex = i;
        break;
      }
    }

    const row = [
      config.teamId,
      config.teamName,
      config.reminderDay,
      config.meetingDay,
      config.active ? 'true' : 'false',
      now,
      config.entityType || 'team',
      config.parentTeamId || '',
    ];

    if (rowIndex > 0) {
      return updateSheetValues(
        tokenData.accessToken,
        spreadsheetId,
        `team_report_config!A${rowIndex + 1}:H${rowIndex + 1}`,
        [row]
      );
    }
    return appendSheetValues(tokenData.accessToken, spreadsheetId, 'team_report_config', [row]);
  } catch (err) {
    logger.error('Error saving team report config:', err);
    return false;
  }
}

/**
 * Delete a team report configuration
 */
export async function deleteTeamReportConfig(teamId: string): Promise<boolean> {
  try {
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) return false;

    const spreadsheetId = tokenData.spreadsheetId;
    const values = await fetchSheetValues(tokenData.accessToken, spreadsheetId, 'team_report_config!A:F');
    if (!values) return false;

    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === teamId) {
        // Mark as inactive instead of deleting
        return updateSheetValues(
          tokenData.accessToken,
          spreadsheetId,
          `team_report_config!E${i + 1}`,
          [['false']]
        );
      }
    }

    return false;
  } catch (err) {
    logger.error('Error deleting team report config:', err);
    return false;
  }
}
