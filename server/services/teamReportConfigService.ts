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
 * Save or update a team report configuration to Firestore
 */
export async function saveTeamReportConfig(config: TeamReportConfig): Promise<boolean> {
  try {
    const { firestoreAdmin } = await import('./firebaseAdmin');
    const now = new Date().toISOString();

    await firestoreAdmin.collection('team_report_config').doc(config.teamId).set({
      teamId: config.teamId,
      teamName: config.teamName,
      reminderDay: config.reminderDay,
      meetingDay: config.meetingDay,
      active: config.active,
      updatedAt: now,
      entityType: config.entityType || 'team',
      parentTeamId: config.parentTeamId || null,
    }, { merge: true });

    logger.info(`Saved team report config for ${config.teamName} (${config.teamId}) to Firestore`);
    return true;
  } catch (err) {
    logger.error('Error saving team report config to Firestore:', err);
    return false;
  }
}

/**
 * Delete a team report configuration from Firestore
 */
export async function deleteTeamReportConfig(teamId: string): Promise<boolean> {
  try {
    const { firestoreAdmin } = await import('./firebaseAdmin');

    await firestoreAdmin.collection('team_report_config').doc(teamId).delete();
    logger.info(`Deleted team report config for team ID: ${teamId} from Firestore`);
    return true;
  } catch (err) {
    logger.error('Error deleting team report config from Firestore:', err);
    return false;
  }
}
